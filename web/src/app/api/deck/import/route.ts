import { NextRequest, NextResponse } from "next/server";
import { parseDeckList, extractMoxfieldDeckId, parseMoxfieldResponse } from "@/lib/deck";
import { lookupDeckCards } from "@/lib/queries";
import { createAnonymousDeck } from "@/lib/deck-queries";
import type { DecklistEntry } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { decklist, url } = body as { decklist?: string; url?: string };

  let entries: DecklistEntry[] = [];
  let sourceUrl: string | null = null;
  let deckName: string | null = null;
  let deckFormat: string | null = null;

  if (url && typeof url === "string") {
    const moxId = extractMoxfieldDeckId(url);
    if (!moxId) {
      return NextResponse.json(
        { error: "Unsupported URL. Currently only Moxfield links are supported." },
        { status: 400 }
      );
    }

    try {
      const res = await fetch(`https://api2.moxfield.com/v3/decks/all/${moxId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Origin": "https://www.moxfield.com",
          "Referer": "https://www.moxfield.com/",
        },
      });

      if (!res.ok) {
        return NextResponse.json(
          {
            error: `Moxfield returned ${res.status}. Try exporting and pasting the decklist instead.`,
            fallback: true,
          },
          { status: 422 }
        );
      }

      const data = await res.json();
      entries = parseMoxfieldResponse(data);
      sourceUrl = url;
      deckName = data.name || null;
      deckFormat = data.format || null;
    } catch {
      return NextResponse.json(
        {
          error: "Failed to fetch from Moxfield. Try pasting the decklist instead.",
          fallback: true,
        },
        { status: 422 }
      );
    }
  } else if (decklist && typeof decklist === "string") {
    entries = parseDeckList(decklist);
  } else {
    return NextResponse.json(
      { error: "Provide either a decklist or a Moxfield URL" },
      { status: 400 }
    );
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "No cards found in decklist" },
      { status: 400 }
    );
  }

  const { matched, unmatched } = await lookupDeckCards(entries);

  const deckCards = matched.map((card) => ({
    oracleId: card.card.oracle_id,
    quantity: card.quantity,
    section: card.section || "Mainboard",
    originalSetCode: card.original_set_code,
    originalCollectorNumber: card.original_collector_number,
    originalIsFoil: card.original_is_foil,
  }));

  const deckId = await createAnonymousDeck({
    name: deckName || "Imported Deck",
    format: deckFormat ?? undefined,
    sourceUrl: sourceUrl ?? undefined,
    cards: deckCards,
  });

  return NextResponse.json({
    deckId,
    cards: matched,
    unmatched,
    stats: {
      total: entries.length,
      matched: matched.length,
      unmatched: unmatched.length,
    },
    meta: {
      source_url: sourceUrl,
      name: deckName,
      format: deckFormat,
    },
  });
}
