import { NextResponse } from "next/server";
import { getDailyChallenge, getIllustrationsForCard, getCardByOracleId } from "@/lib/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;

  if (!["remix", "vs", "gauntlet"].includes(type)) {
    return NextResponse.json({ error: "Invalid challenge type" }, { status: 400 });
  }

  try {
    const challenge = await getDailyChallenge(type);
    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    // For remix, also include illustrations for the card
    if (type === "remix" && challenge.oracle_id) {
      const [card, illustrations] = await Promise.all([
        getCardByOracleId(challenge.oracle_id),
        getIllustrationsForCard(challenge.oracle_id),
      ]);
      return NextResponse.json({ challenge, card, illustrations });
    }

    // For VS, include both card details
    if (type === "vs" && challenge.oracle_id_a && challenge.oracle_id_b) {
      const [cardA, cardB] = await Promise.all([
        getCardByOracleId(challenge.oracle_id_a),
        getCardByOracleId(challenge.oracle_id_b),
      ]);
      return NextResponse.json({ challenge, cardA, cardB });
    }

    // For gauntlet, pool is already in the challenge
    return NextResponse.json({ challenge });
  } catch (err) {
    console.error(`Failed to get daily ${type}:`, err);
    return NextResponse.json({ error: "Failed to load challenge" }, { status: 500 });
  }
}
