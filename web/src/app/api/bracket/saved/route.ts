import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/bracket/saved
 * Lists the authenticated user's saved brackets, newest first.
 * Anonymous callers get 401 — /my/brackets should fall back to
 * localStorage for anon traffic.
 *
 * Response:
 *  { brackets: Array<{
 *      id, brewSlug, brewName, cardCount, completedAt,
 *      champion: { oracle_id, illustration_id, name, artist,
 *                  set_code, collector_number, image_version, slug }
 *    }> }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

    const { data, error } = await supabase
      .from("saved_brackets")
      .select(
        "id, brew_slug, brew_name, card_count, completed_at, seed_id, completion_id, champion_oracle_id, champion_illustration_id, champion_name, champion_artist, champion_set_code, champion_collector_number, champion_image_version, champion_slug",
      )
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const brackets = (data ?? []).map((row) => ({
      id: row.id,
      brewSlug: row.brew_slug,
      brewName: row.brew_name,
      cardCount: row.card_count,
      completedAt: row.completed_at,
      seedId: row.seed_id,
      completionId: row.completion_id,
      champion: {
        oracle_id: row.champion_oracle_id,
        illustration_id: row.champion_illustration_id,
        name: row.champion_name,
        artist: row.champion_artist,
        set_code: row.champion_set_code,
        collector_number: row.champion_collector_number,
        image_version: row.champion_image_version,
        slug: row.champion_slug,
      },
    }));

    return NextResponse.json({ brackets });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
