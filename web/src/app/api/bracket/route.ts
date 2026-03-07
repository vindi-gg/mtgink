import { NextResponse } from "next/server";
import { getRandomBracketCards } from "@/lib/bracket";

export const dynamic = "force-dynamic";

export async function GET() {
  const cards = getRandomBracketCards(32);
  return NextResponse.json({ cards });
}
