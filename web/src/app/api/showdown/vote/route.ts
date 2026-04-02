import { NextRequest, NextResponse } from "next/server";
import { recordVote, getComparisonPair, recordCardVote, getClashPair } from "@/lib/queries";
import { checkArtVote, checkCardVote } from "@/lib/vote-protection";
import { createClient } from "@/lib/supabase/server";
import type { CompareFilters } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, session_id, filters } = body;
    const parsedFilters: CompareFilters | undefined = filters || undefined;

    if (!session_id || !mode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Attach user_id if logged in
    let userId: string | undefined;
    const supabase = await createClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    }

    if (mode === "vs") {
      return handleVsVote(body, session_id, userId, parsedFilters);
    }

    return handleRemixVote(body, session_id, userId, parsedFilters);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleRemixVote(
  body: Record<string, unknown>,
  sessionId: string,
  userId: string | undefined,
  filters: CompareFilters | undefined,
) {
  const { oracle_id, winner_illustration_id, loser_illustration_id } = body;

  if (!oracle_id || !winner_illustration_id || !loser_illustration_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const protection = await checkArtVote(
    sessionId,
    winner_illustration_id as string,
    loser_illustration_id as string,
    !!userId,
  );

  if (!protection.allowed) {
    return NextResponse.json({ error: protection.reason }, { status: 429 });
  }

  const [voteResult, next] = await Promise.all([
    recordVote({
      oracle_id: oracle_id as string,
      winner_illustration_id: winner_illustration_id as string,
      loser_illustration_id: loser_illustration_id as string,
      session_id: sessionId,
      user_id: userId,
      vote_source: "showdown_remix",
    }, protection.kFactor),
    getComparisonPair(undefined, filters).catch(() => getComparisonPair()),
  ]);

  return NextResponse.json({
    winner_rating: voteResult.winnerRating,
    loser_rating: voteResult.loserRating,
    next,
  });
}

async function handleVsVote(
  body: Record<string, unknown>,
  sessionId: string,
  userId: string | undefined,
  filters: CompareFilters | undefined,
) {
  const { winner_oracle_id, loser_oracle_id } = body;

  if (!winner_oracle_id || !loser_oracle_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const protection = await checkCardVote(
    sessionId,
    winner_oracle_id as string,
    loser_oracle_id as string,
    !!userId,
  );

  if (!protection.allowed) {
    return NextResponse.json({ error: protection.reason }, { status: 429 });
  }

  const [result, next] = await Promise.all([
    recordCardVote({
      winner_oracle_id: winner_oracle_id as string,
      loser_oracle_id: loser_oracle_id as string,
      session_id: sessionId,
      user_id: userId,
      vote_source: "showdown_vs",
    }, protection.kFactor),
    getClashPair(filters),
  ]);

  return NextResponse.json({
    winner_rating: result.winner_rating,
    loser_rating: result.loser_rating,
    next,
  });
}
