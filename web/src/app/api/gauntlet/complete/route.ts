import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { recordVote, recordCardVote } from "@/lib/queries";

interface Matchup {
  mode: "remix" | "vs";
  oracle_id?: string;
  winner_illustration_id?: string;
  loser_illustration_id?: string;
  winner_oracle_id?: string;
  loser_oracle_id?: string;
}

// Lower K-factor for gauntlet votes — each matchup is less deliberate
// than a dedicated head-to-head comparison
const GAUNTLET_K_FACTOR = 16;

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

  const { error } = await admin.from("gauntlet_results").insert({
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
  });

  if (error) {
    console.error("Failed to save gauntlet result:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  // Apply ELO updates from matchups (fire-and-forget, don't block response)
  if (Array.isArray(matchups) && matchups.length > 0) {
    processMatchups(matchups, session_id, userId).catch((err) => {
      console.error("Failed to process gauntlet ELO updates:", err);
    });
  }

  return NextResponse.json({ ok: true });
}

async function processMatchups(
  matchups: Matchup[],
  sessionId: string,
  userId: string | null,
) {
  // Process sequentially to avoid race conditions on the same illustration's ELO
  for (const m of matchups) {
    try {
      if (m.mode === "remix" && m.oracle_id && m.winner_illustration_id && m.loser_illustration_id) {
        await recordVote({
          oracle_id: m.oracle_id,
          winner_illustration_id: m.winner_illustration_id,
          loser_illustration_id: m.loser_illustration_id,
          session_id: sessionId,
          user_id: userId ?? undefined,
          vote_source: "gauntlet_remix",
        }, GAUNTLET_K_FACTOR);
      } else if (m.mode === "vs" && m.winner_oracle_id && m.loser_oracle_id) {
        await recordCardVote({
          winner_oracle_id: m.winner_oracle_id,
          loser_oracle_id: m.loser_oracle_id,
          session_id: sessionId,
          user_id: userId ?? undefined,
          vote_source: "gauntlet_vs",
        }, GAUNTLET_K_FACTOR);
      }
    } catch (err) {
      // Log but continue — don't let one failed vote block the rest
      console.error("Gauntlet ELO update failed for matchup:", err);
    }
  }
}
