import { NextRequest, NextResponse } from "next/server";
import { getGauntletCards } from "@/lib/queries";
import type { CompareFilters } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const count = Math.min(parseInt(searchParams.get("count") ?? "10"), 50);
  const exclude = searchParams.get("exclude")?.split(",").filter(Boolean);

  const colors = searchParams.get("colors")?.split(",").filter(Boolean);
  const type = searchParams.get("type") || undefined;
  const subtype = searchParams.get("subtype") || undefined;
  const set_code = searchParams.get("set_code") || undefined;
  const rules_text = searchParams.get("rules_text") || undefined;

  const filters: CompareFilters | undefined =
    colors?.length || type || subtype || set_code || rules_text
      ? { colors, type, subtype, set_code, rules_text }
      : undefined;

  try {
    const entries = await getGauntletCards(count, filters, exclude);
    return NextResponse.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch gauntlet cards";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
