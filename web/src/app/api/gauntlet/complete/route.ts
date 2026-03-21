import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface Matchup {
  mode: "remix" | "vs";
  oracle_id?: string;
  winner_illustration_id?: string;
  loser_illustration_id?: string;
  winner_oracle_id?: string;
  loser_oracle_id?: string;
}

// Anonymous gauntlet votes use lower K-factor (less deliberate than head-to-head)
// Authenticated users get full K=32 (stored proc default when no override passed)
const ANON_GAUNTLET_K_FACTOR = 16;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    session_id,
    mode,
    pool_size,
    champion_oracle_id,
    champion_illustration_id,
    champion_name,
    champion_wins,
    results,
    matchups,
    daily_challenge_id,
    card_name,
    filter_label,
    brew_id,
  } = body;

  if (!session_id || !mode || !results || !champion_oracle_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get user_id if logged in
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    if (!supabase) throw new Error("no auth");
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Not logged in, that's fine
  }

  const admin = getAdminClient();

  const { data: inserted, error } = await admin.from("gauntlet_results").insert({
    user_id: userId,
    session_id,
    mode,
    pool_size,
    champion_oracle_id,
    champion_illustration_id,
    champion_name,
    champion_wins,
    results,
    daily_challenge_id: daily_challenge_id ?? null,
    card_name: card_name ?? null,
    filter_label: filter_label ?? null,
    brew_id: brew_id ?? null,
  }).select("id").single();

  if (error) {
    console.error("Failed to save gauntlet result:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  // Update daily challenge stats + record participation if this is a daily gauntlet
  // Awaited so stats are committed before the client navigates to results
  if (daily_challenge_id) {
    const champId = mode === "remix" ? champion_illustration_id : champion_oracle_id;
    const [{ error: statsErr }, { error: partErr }] = await Promise.all([
      admin.rpc("increment_daily_gauntlet_stats", {
        p_challenge_id: daily_challenge_id,
        p_champion_id: champId,
        p_champion_wins: champion_wins,
      }),
      admin.from("daily_participations").upsert({
        challenge_id: daily_challenge_id,
        session_id,
        user_id: userId,
        result: { champion_id: champId, champion_wins },
      }, { onConflict: "challenge_id,session_id" }),
    ]);
    if (statsErr) console.error("Failed to update daily stats:", statsErr);
    if (partErr) console.error("Failed to record participation:", partErr);
  }

  // Apply ELO updates from matchups in a single DB call (fire-and-forget)
  if (Array.isArray(matchups) && matchups.length > 0) {
    const kFactor = userId ? undefined : ANON_GAUNTLET_K_FACTOR;
    admin.rpc("process_gauntlet_matchups", {
      p_matchups: JSON.stringify(matchups),
      p_session_id: session_id,
      p_user_id: userId ?? null,
      p_k_factor: kFactor ?? null,
    }).then(({ error: eloErr }) => {
      if (eloErr) console.error("Failed to process gauntlet ELO updates:", eloErr);
    });
  }

  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
}
