import { NextResponse } from "next/server";
import { recordCardVote, getClashPair } from "@/lib/queries";
import { checkCardVote } from "@/lib/vote-protection";
import { createClient } from "@/lib/supabase/server";
import type { CompareFilters } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json();
  const { winner_oracle_id, loser_oracle_id, session_id, filters } = body;

  if (!winner_oracle_id || !loser_oracle_id || !session_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    // Attach user_id if logged in
    let userId: string | undefined;
    const supabase = await createClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    }

    // Vote protection: duplicate check + diminishing K factor
    const protection = await checkCardVote(
      session_id,
      winner_oracle_id,
      loser_oracle_id,
      !!userId,
    );

    if (!protection.allowed) {
      return NextResponse.json({ error: protection.reason }, { status: 429 });
    }

    const parsedFilters: CompareFilters | undefined = filters || undefined;

    // Run vote recording and next pair fetch in parallel
    const [result, next] = await Promise.all([
      recordCardVote({
        winner_oracle_id,
        loser_oracle_id,
        session_id,
        user_id: userId,
        vote_source: "clash_vs",
      }, protection.kFactor),
      getClashPair(parsedFilters),
    ]);

    return NextResponse.json({
      winner_rating: result.winner_rating,
      loser_rating: result.loser_rating,
      next,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Vote failed" },
      { status: 500 }
    );
  }
}
