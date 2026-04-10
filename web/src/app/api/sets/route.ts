import { NextRequest, NextResponse } from "next/server";
import { getPlayableSets, getNonDigitalSets } from "@/lib/queries";

export async function GET(request: NextRequest) {
  // ?all=true returns every non-digital set including subsets (tokens,
  // mystical archive, promos, etc.) — used by the brew form's expansion
  // search so users can target a commander/token/masterpiece subset.
  // Default returns the smaller "playable" list (expansion/core/masters/etc).
  const all = request.nextUrl.searchParams.get("all") === "true";
  const sets = all ? await getNonDigitalSets() : await getPlayableSets();
  return NextResponse.json({ sets });
}
