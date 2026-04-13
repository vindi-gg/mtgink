import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveBrewPool } from "@/lib/brew-queries";
import { seededShuffle } from "@/lib/seeded-random";
import type { BracketCard, GauntletEntry } from "@/lib/types";

function entryToBracketCard(entry: GauntletEntry): BracketCard {
  return {
    oracle_id: entry.oracle_id,
    name: entry.name,
    slug: entry.slug,
    type_line: entry.type_line ?? "",
    artist: entry.artist,
    set_code: entry.set_code,
    set_name: entry.set_name,
    collector_number: entry.collector_number,
    illustration_id: entry.illustration_id,
    image_version: entry.image_version,
  };
}

/**
 * POST /api/bracket/seed — create a shareable bracket configuration.
 *
 * Body: { params, label, bracket_size, seed? }
 *
 * params is a flexible JSONB object describing the source:
 *   { source: "theme", themeId: 280 }
 *   { source: "expansion", sourceId: "stx", colors: ["W"], ... }
 *   etc.
 *
 * If seed is not provided, a random one is generated.
 * The pool is resolved, seeded-shuffled, sliced, and cached in the row.
 * Dedup: same (params, bracket_size, seed) returns the existing row.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { params, label, bracket_size, seed: providedSeed } = body as {
      params: Record<string, unknown>;
      label: string;
      bracket_size: number;
      seed?: string;
    };

    if (!params || !label || typeof bracket_size !== "number" || bracket_size < 2 || bracket_size > 1024) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const seed = providedSeed || Math.random().toString(36).slice(2, 14);
    const admin = getAdminClient();

    // Check for existing seed with same content hash
    const paramsHash = params ? JSON.stringify(params) : "";
    const { data: existing } = await admin
      .from("bracket_seeds")
      .select("id, pool, label, bracket_size")
      .eq("bracket_size", bracket_size)
      .eq("seed", seed)
      .maybeSingle();

    // Simple dedup: if we already have this exact seed+size combo, return it
    if (existing) {
      return NextResponse.json(existing);
    }

    // Resolve pool from params
    const source = params.source as string;
    let pool: GauntletEntry[] = [];

    if (source === "theme") {
      // Look up the theme to get its source details
      const themeId = params.themeId as number;
      const { data: theme } = await admin
        .from("gauntlet_themes")
        .select("theme_type, oracle_id, tribe, tag_id, set_code, artist")
        .eq("id", themeId)
        .single();

      if (!theme) {
        return NextResponse.json({ error: "Theme not found" }, { status: 404 });
      }

      const resolveSource = theme.theme_type === "tribe" ? "tribe"
        : theme.theme_type === "tag" ? "tag"
        : theme.theme_type === "artist" ? "artist"
        : theme.theme_type === "set" ? "expansion"
        : "all";
      const resolveSourceId = theme.tribe ?? theme.tag_id ?? theme.set_code ?? theme.artist ?? theme.oracle_id ?? "_all";

      pool = await resolveBrewPool({
        mode: "bracket",
        source: resolveSource,
        sourceId: resolveSourceId,
        poolSize: bracket_size * 2, // fetch extra, seeded shuffle + slice handles the rest
      });
    } else {
      // Generic source: expansion, tag, artist, brew, all
      pool = await resolveBrewPool({
        mode: "bracket",
        source: source === "art_tag" ? "tag" : source,
        sourceId: (params.sourceId as string) ?? "_all",
        colors: params.colors as string[] | undefined,
        cardType: params.cardType as string | undefined,
        subtype: params.subtype as string | undefined,
        rulesText: params.rulesText as string | undefined,
        poolSize: bracket_size * 2,
        includeChildren: params.includeChildren as boolean | undefined,
        onlyNewCards: params.onlyNewCards as boolean | undefined,
        firstIllustrationOnly: params.firstIllustrationOnly as boolean | undefined,
        lastIllustrationOnly: params.lastIllustrationOnly as boolean | undefined,
      });
    }

    if (pool.length < 2) {
      return NextResponse.json(
        { error: `Not enough cards: got ${pool.length}, need at least 2` },
        { status: 400 },
      );
    }

    // Deterministic shuffle + slice. If the pool has fewer cards than
    // requested, use what's available (handles "All" with small themes).
    const actualSize = Math.min(bracket_size, pool.length);
    const shuffled = seededShuffle(pool, seed);
    const cards = shuffled.slice(0, actualSize).map(entryToBracketCard);

    // Get user_id if logged in
    let createdBy: string | null = null;
    try {
      const supabase = await createClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        createdBy = user?.id ?? null;
      }
    } catch { /* anon */ }

    const { data, error } = await admin
      .from("bracket_seeds")
      .insert({
        params,
        label,
        bracket_size: actualSize,
        seed,
        pool: cards,
        created_by: createdBy,
      })
      .select("id, pool, label, bracket_size")
      .single();

    if (error) {
      // Unique constraint violation — return the existing one
      if (error.code === "23505") {
        const { data: dup } = await admin
          .from("bracket_seeds")
          .select("id, pool, label, bracket_size")
          .eq("bracket_size", bracket_size)
          .eq("seed", seed)
          .single();
        if (dup) return NextResponse.json(dup);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create bracket seed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
