import { NextResponse } from "next/server";
import { recordCardVote, getClashPair } from "@/lib/queries";
import type { CompareFilters } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json();
  const { winner_oracle_id, loser_oracle_id, session_id, filters } = body;

  if (!winner_oracle_id || !loser_oracle_id || !session_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const result = await recordCardVote({
      winner_oracle_id,
      loser_oracle_id,
      session_id,
      vote_source: "clash_vs",
    });

    const parsedFilters: CompareFilters | undefined = filters || undefined;
    const next = await getClashPair(parsedFilters);

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
