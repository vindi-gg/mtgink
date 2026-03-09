import { NextResponse } from "next/server";
import { getRandomBracketCards } from "@/lib/bracket";

export const dynamic = "force-dynamic";

export async function GET() {
  const cards = await getRandomBracketCards(32);
  return NextResponse.json({ cards });
}
