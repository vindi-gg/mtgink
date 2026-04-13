import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/bracket/themes
 * Public theme endpoint for the bracket creation modal.
 * - ?random=1&min_pool=16 → one random theme with pool_size_estimate >= min_pool
 * - ?q=dragon&min_pool=16 → search themes by label
 *
 * Excludes card_remix (typically < 16 illustrations — too few for brackets).
 * No auth required.
 */
/** If theme has no pool_size_estimate, compute it from the DB. */
async function fillPoolEstimate(
  admin: ReturnType<typeof getAdminClient>,
  theme: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (theme.pool_size_estimate != null) return theme;

  let count = 0;
  if (theme.theme_type === "tribe" && theme.tribe) {
    const { data } = await admin
      .from("oracle_cards")
      .select("oracle_id", { count: "exact", head: true })
      .contains("subtypes", JSON.stringify([theme.tribe]));
    count = (data as unknown as number) ?? 0;
    // Supabase count query returns count in the response metadata
    // Re-query with count
    const { count: c } = await admin
      .from("oracle_cards")
      .select("*", { count: "exact", head: true })
      .contains("subtypes", JSON.stringify([theme.tribe]));
    count = c ?? 0;
  } else if (theme.theme_type === "artist" && theme.artist) {
    const { count: c } = await admin
      .from("printings")
      .select("*", { count: "exact", head: true })
      .eq("artist", theme.artist as string)
      .not("illustration_id", "is", null);
    count = c ?? 0;
  }

  return { ...theme, pool_size_estimate: count || null };
}

/** If theme has no preview image, find one from a representative card. */
async function fillPreview(
  admin: ReturnType<typeof getAdminClient>,
  theme: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (theme.preview_set_code) return theme;

  // Find a card that matches this theme's source
  let oracleId: string | null = null;
  if (theme.theme_type === "tribe" && theme.tribe) {
    const { data } = await admin
      .from("oracle_cards")
      .select("oracle_id")
      .contains("subtypes", JSON.stringify([theme.tribe]))
      .limit(1);
    oracleId = data?.[0]?.oracle_id ?? null;
  } else if (theme.theme_type === "tag" && theme.tag_id) {
    const { data } = await admin
      .from("oracle_tags")
      .select("oracle_id")
      .eq("tag_id", theme.tag_id)
      .limit(1);
    oracleId = data?.[0]?.oracle_id ?? null;
  } else if (theme.theme_type === "artist" && theme.artist) {
    const { data } = await admin
      .from("printings")
      .select("set_code, collector_number, image_version")
      .eq("artist", theme.artist)
      .not("illustration_id", "is", null)
      .limit(1);
    if (data?.[0]) {
      return { ...theme, preview_set_code: data[0].set_code, preview_collector_number: data[0].collector_number, preview_image_version: data[0].image_version };
    }
  } else if (theme.theme_type === "set" && theme.set_code) {
    const { data } = await admin
      .from("printings")
      .select("set_code, collector_number, image_version")
      .eq("set_code", theme.set_code)
      .not("illustration_id", "is", null)
      .limit(1);
    if (data?.[0]) {
      return { ...theme, preview_set_code: data[0].set_code, preview_collector_number: data[0].collector_number, preview_image_version: data[0].image_version };
    }
  }

  if (oracleId) {
    const { data } = await admin
      .from("printings")
      .select("set_code, collector_number, image_version")
      .eq("oracle_id", oracleId)
      .not("illustration_id", "is", null)
      .limit(1);
    if (data?.[0]) {
      return { ...theme, preview_set_code: data[0].set_code, preview_collector_number: data[0].collector_number, preview_image_version: data[0].image_version };
    }
  }

  return theme;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const random = params.get("random") === "1";
  const q = params.get("q");
  const minPool = parseInt(params.get("min_pool") ?? "16", 10);

  const admin = getAdminClient();
  const cols = "id, label, theme_type, pool_mode, description, pool_size_estimate, preview_set_code, preview_collector_number, preview_image_version, tribe, tag_id, set_code, artist";

  if (random) {
    // pool_size_estimate is NULL for many tags/artists — treat NULL as
    // "unknown but probably large enough" so they're included.
    const { data: themes } = await admin
      .from("gauntlet_themes")
      .select(cols)
      .eq("is_active", true)
      .not("theme_type", "in", '("card_remix","tag")')
      .or(`pool_size_estimate.gte.${minPool},pool_size_estimate.is.null`);

    if (!themes || themes.length === 0) {
      return NextResponse.json({ theme: null });
    }

    // Weighted selection: 70% tribe, 30% artist. If one type has no
    // candidates, fall back to the other.
    const tribes = themes.filter((t) => t.theme_type === "tribe");
    const artists = themes.filter((t) => t.theme_type === "artist");
    const others = themes.filter((t) => t.theme_type !== "tribe" && t.theme_type !== "artist");

    let pool = themes;
    if (tribes.length > 0 && artists.length > 0) {
      pool = Math.random() < 0.7 ? tribes : artists;
    } else if (tribes.length > 0) {
      pool = tribes;
    } else if (artists.length > 0) {
      pool = artists;
    }
    // Include others if that's all we have
    if (pool.length === 0) pool = others.length > 0 ? others : themes;

    const picked = pool[Math.floor(Math.random() * pool.length)] as Record<string, unknown>;
    // Fill missing estimate (rare after refresh_theme_estimates.sql runs)
    const withEst = picked.pool_size_estimate != null ? picked : await fillPoolEstimate(admin, picked);
    const withPreview = await fillPreview(admin, withEst);
    return NextResponse.json({ theme: withPreview });
  }

  if (q && q.length >= 2) {
    const { data: themes } = await admin
      .from("gauntlet_themes")
      .select(cols)
      .eq("is_active", true)
      .not("theme_type", "in", '("card_remix","tag")')
      .or(`pool_size_estimate.gte.${minPool},pool_size_estimate.is.null`)
      .ilike("label", `%${q}%`)
      .order("pool_size_estimate", { ascending: false })
      .limit(20);

    return NextResponse.json({ themes: themes ?? [] });
  }

  return NextResponse.json({ themes: [] });
}
