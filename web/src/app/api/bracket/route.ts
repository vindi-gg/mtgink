import { NextRequest, NextResponse } from "next/server";
import { getRandomBracketCards } from "@/lib/bracket";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const count = parseInt(req.nextUrl.searchParams.get("count") ?? "32", 10);
  const cards = await getRandomBracketCards(count);
  return NextResponse.json({ cards });
}
