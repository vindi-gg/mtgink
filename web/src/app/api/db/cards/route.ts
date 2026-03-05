import { NextRequest, NextResponse } from "next/server";
import { searchAllCards } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results = searchAllCards(q.trim());
  return NextResponse.json({ results });
}
