import { NextRequest, NextResponse } from "next/server";
import { getComparisonPair } from "@/lib/queries";
import type { CompareFilters } from "@/lib/types";

function parseFilters(searchParams: URLSearchParams): CompareFilters | undefined {
  const colors = searchParams.get("colors");
  const type = searchParams.get("type");
  const subtype = searchParams.get("subtype");
  const set_code = searchParams.get("set_code");
  const mode = searchParams.get("mode");

  if (!colors && !type && !subtype && !set_code && !mode) return undefined;

  return {
    colors: colors ? colors.split(",").filter(Boolean) : undefined,
    type: type || undefined,
    subtype: subtype || undefined,
    set_code: set_code || undefined,
    mode: mode === "cross" ? "cross" : undefined,
  };
}

export async function GET(request: NextRequest) {
  const oracleId = request.nextUrl.searchParams.get("oracle_id") ?? undefined;
  const filters = parseFilters(request.nextUrl.searchParams);

  try {
    const pair = await getComparisonPair(oracleId, filters);
    return NextResponse.json(pair);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
