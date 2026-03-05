import { NextRequest, NextResponse } from "next/server";
import { getComparisonPair } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const oracleId = request.nextUrl.searchParams.get("oracle_id") ?? undefined;

  try {
    const pair = getComparisonPair(oracleId);
    return NextResponse.json(pair);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
