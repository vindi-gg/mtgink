import { NextRequest, NextResponse } from "next/server";
import { recordVote, getComparisonPair } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { VotePayload } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VotePayload;

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

    const { winnerRating, loserRating } = recordVote(body);
    const next = getComparisonPair();

    return NextResponse.json({
      winner_rating: winnerRating,
      loser_rating: loserRating,
      next,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
