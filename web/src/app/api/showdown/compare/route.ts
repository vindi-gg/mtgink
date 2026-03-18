import { NextRequest, NextResponse } from "next/server";
import { getComparisonPair, getClashPair } from "@/lib/queries";
import type { CompareFilters } from "@/lib/types";

function parseFilters(searchParams: URLSearchParams): CompareFilters | undefined {
  const colors = searchParams.get("colors");
  const type = searchParams.get("type");
  const subtype = searchParams.get("subtype");
  const set_code = searchParams.get("set_code");
  const rules_text = searchParams.get("rules_text");

  if (!colors && !type && !subtype && !set_code && !rules_text) return undefined;

  return {
    colors: colors ? colors.split(",").filter(Boolean) : undefined,
    type: type || undefined,
    subtype: subtype || undefined,
    set_code: set_code || undefined,
    rules_text: rules_text || undefined,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("mode") ?? "remix";
  const oracleId = searchParams.get("oracle_id") ?? undefined;
  const filters = parseFilters(searchParams);

  try {
    if (mode === "vs") {
      const pair = await getClashPair(filters);
      return NextResponse.json(pair);
    }

    // Remix: same-card comparison
    const pair = await getComparisonPair(oracleId, filters);
    return NextResponse.json(pair);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get pair" },
      { status: 500 },
    );
  }
}
