import { NextRequest, NextResponse } from "next/server";
import { getBrewCount } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const source = params.get("source");
  const sourceId = params.get("source_id");

  if (!source || !sourceId) {
    return NextResponse.json({ count: 0 });
  }

  const colors = params.get("colors")?.split(",").filter(Boolean);
  const type = params.get("type") || undefined;
  const subtype = params.get("subtype") || undefined;
  const rulesText = params.get("rules_text") || undefined;
  const rarity = params.get("rarity") || undefined;
  const includeChildren = params.get("include_children") === "true";
  const onlyNewCards = params.get("only_new_cards") === "true";
  const firstIllustrationOnly = params.get("first_illustration_only") === "true";
  const lastIllustrationOnly = params.get("last_illustration_only") === "true";

  try {
    // Both first and last illustration mean "one per card" for counting
    const count = await getBrewCount(
      source,
      sourceId,
      colors,
      type,
      subtype,
      rulesText,
      rarity,
      includeChildren,
      onlyNewCards,
      firstIllustrationOnly || lastIllustrationOnly,
    );
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
