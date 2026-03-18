import { NextRequest, NextResponse } from "next/server";
import { searchArtists } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ artists: [] });
  }
  const artists = await searchArtists(q.trim());
  return NextResponse.json({ artists });
}
