import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/bracket/save
 * Persists a completed bracket for the authenticated user. Anonymous
 * callers are rejected — anon history lives in localStorage client-side.
 *
 * Body:
 *  {
 *    brew_slug: string | null,
 *    brew_name: string | null,
 *    card_count: number,
 *    champion: {
 *      oracle_id, illustration_id, name, artist, set_code,
 *      collector_number, image_version, slug
 *    }
 *  }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json()) as {
      brew_slug?: string | null;
      brew_name?: string | null;
      card_count?: number;
      champion?: {
        oracle_id?: string;
        illustration_id?: string;
        name?: string;
        artist?: string;
        set_code?: string;
        collector_number?: string;
        image_version?: string | null;
        slug?: string;
      };
    };

    const champ = body.champion;
    if (
      !champ ||
      !champ.oracle_id ||
      !champ.illustration_id ||
      !champ.name ||
      !champ.artist ||
      !champ.set_code ||
      !champ.collector_number ||
      !champ.slug
    ) {
      return NextResponse.json({ error: "champion fields missing" }, { status: 400 });
    }
    if (typeof body.card_count !== "number" || body.card_count < 2) {
      return NextResponse.json({ error: "card_count invalid" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("saved_brackets")
      .insert({
        user_id: user.id,
        brew_slug: body.brew_slug ?? null,
        brew_name: body.brew_name ?? null,
        card_count: body.card_count,
        champion_oracle_id: champ.oracle_id,
        champion_illustration_id: champ.illustration_id,
        champion_name: champ.name,
        champion_artist: champ.artist,
        champion_set_code: champ.set_code,
        champion_collector_number: champ.collector_number,
        champion_image_version: champ.image_version ?? null,
        champion_slug: champ.slug,
      })
      .select("id, completed_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, completed_at: data.completed_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
