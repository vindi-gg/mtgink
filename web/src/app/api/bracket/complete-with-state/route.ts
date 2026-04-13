import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/bracket/complete-with-state
 * Saves a completed bracket with full state for sharing. Auth required.
 *
 * Body: {
 *   seed_id: string,
 *   bracket_state: BracketState (full JSONB),
 *   matchups: Array<{ winner_illustration_id, loser_illustration_id, winner_oracle_id, loser_oracle_id }>,
 *   champion: { illustration_id, name, oracle_id, artist, set_code, collector_number, image_version, slug }
 * }
 *
 * Does three things:
 * 1. Inserts into bracket_completions (shareable results)
 * 2. Processes ELO via process_bracket_matchups RPC
 * 3. Saves to saved_brackets (My Brackets history)
 * 4. Increments seed play_count
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
    }
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { seed_id, bracket_state, matchups, champion, session_id } = body;

    if (!seed_id || !bracket_state || !matchups || !champion) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const admin = getAdminClient();
    const userId = user?.id ?? null;

    // 1. Save completion (auth'd users only — gives shareable results URL)
    let completionId: string | null = null;
    if (userId) {
      const { data: completion, error: compErr } = await admin
        .from("bracket_completions")
        .insert({
          seed_id,
          user_id: userId,
          champion_illustration_id: champion.illustration_id,
          champion_name: champion.name,
          bracket_state,
        })
        .select("id")
        .single();

      if (compErr) {
        console.error("Failed to save bracket completion:", compErr);
      } else {
        completionId = completion.id;
      }
    }

    // 2. Process ELO updates
    const kFactor = userId ? undefined : 16; // lower K for anon
    const { error: eloErr } = await admin.rpc("process_bracket_matchups", {
      p_matchups: matchups,
      p_session_id: session_id ?? "anon",
      p_user_id: userId,
      p_k_factor: kFactor ?? null,
    });
    if (eloErr) {
      console.error("Failed to process bracket ELO:", eloErr);
    }

    // 3. Save to saved_brackets for My Brackets (auth'd only)
    if (userId) {
      await admin
        .from("saved_brackets")
        .insert({
          user_id: userId,
          brew_slug: null,
          brew_name: null,
          card_count: bracket_state.cards?.length ?? 0,
          champion_oracle_id: champion.oracle_id,
          champion_illustration_id: champion.illustration_id,
          champion_name: champion.name,
          champion_artist: champion.artist,
          champion_set_code: champion.set_code,
          champion_collector_number: champion.collector_number,
          champion_image_version: champion.image_version ?? null,
          champion_slug: champion.slug,
          seed_id,
          completion_id: completionId,
        })
        .then(({ error }) => {
          if (error) console.error("Failed to save to saved_brackets:", error);
        });
    }

    // 4. Increment play count
    await admin.rpc("increment_bracket_seed_play_count", { p_seed_id: seed_id });

    return NextResponse.json({
      completion_id: completionId,
      ok: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete bracket";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
