import { NextResponse } from "next/server";
import { getClashPair } from "@/lib/queries";
import type { CompareFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const colors = searchParams.get("colors");
  const type = searchParams.get("type");
  const subtype = searchParams.get("subtype");

  const filters: CompareFilters | undefined =
    colors || type || subtype
      ? {
          colors: colors ? colors.split(",").filter(Boolean) : undefined,
          type: type || undefined,
          subtype: subtype || undefined,
        }
      : undefined;

  try {
    const pair = await getClashPair(filters);
    return NextResponse.json(pair);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get clash pair" },
      { status: 500 }
    );
  }
}
