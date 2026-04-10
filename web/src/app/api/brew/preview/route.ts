import { NextRequest, NextResponse } from "next/server";
import { resolveBrewPool } from "@/lib/brew-queries";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mode, source, source_id, colors, card_type, subtype, rules_text, rarity,
      pool_size, include_children, only_new_cards, first_illustration_only,
    } = body;

    if (!mode || !source) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const pool = await resolveBrewPool({
      mode,
      source,
      sourceId: source_id,
      colors,
      cardType: card_type,
      subtype,
      rulesText: rules_text,
      rarity,
      poolSize: pool_size,
      includeChildren: include_children,
      onlyNewCards: only_new_cards,
      firstIllustrationOnly: first_illustration_only,
    });

    return NextResponse.json({ pool });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve pool";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
