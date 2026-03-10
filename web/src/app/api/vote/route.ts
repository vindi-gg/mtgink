import { NextRequest, NextResponse } from "next/server";
import { recordVote, getComparisonPair } from "@/lib/queries";
import { checkArtVote } from "@/lib/vote-protection";
import { createClient } from "@/lib/supabase/server";
import type { VotePayload, CompareFilters } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const body = raw as VotePayload;
    const filters = raw.filters as CompareFilters | undefined;

    if (
      !body.oracle_id ||
      !body.winner_illustration_id ||
      !body.loser_illustration_id ||
      !body.session_id
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Attach user_id if logged in (non-blocking — anonymous votes still work)
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        body.user_id = user.id;
      }
    }

    // Preserve vote_source if provided (e.g. 'deck', 'bracket')
    if (body.vote_source && typeof body.vote_source !== "string") {
      delete body.vote_source;
    }

    // Vote protection: duplicate check + diminishing K factor
    const protection = await checkArtVote(
      body.session_id,
      body.winner_illustration_id,
      body.loser_illustration_id,
      !!body.user_id,
    );

    if (!protection.allowed) {
      return NextResponse.json({ error: protection.reason }, { status: 429 });
    }

    // Run vote recording and next pair fetch in parallel — next pair doesn't depend on vote result
    const [voteResult, next] = await Promise.all([
      recordVote(body, protection.kFactor),
      getComparisonPair(undefined, filters).catch(() => getComparisonPair()),
    ]);

    return NextResponse.json({
      winner_rating: voteResult.winnerRating,
      loser_rating: voteResult.loserRating,
      next,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
