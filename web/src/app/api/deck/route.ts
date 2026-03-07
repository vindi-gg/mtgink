import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupAndCreateDeck, getDecksByUser } from "@/lib/deck-queries";
import { parseDeckList } from "@/lib/deck";
import type { DecklistEntry } from "@/lib/types";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = getDecksByUser(user.id);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, format, is_public, source_url, cards, decklist } = body as {
    name: string;
    format?: string;
    is_public?: boolean;
    source_url?: string;
    cards?: DecklistEntry[];
    decklist?: string;
  };

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Missing deck name" }, { status: 400 });
  }

  let entries: DecklistEntry[];
  if (cards && Array.isArray(cards)) {
    entries = cards;
  } else if (decklist && typeof decklist === "string") {
    entries = parseDeckList(decklist);
  } else {
    return NextResponse.json(
      { error: "Provide either cards array or decklist text" },
      { status: 400 }
    );
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "No cards provided" }, { status: 400 });
  }

  const { deckId, unmatched } = lookupAndCreateDeck(user.id, name, entries, {
    format,
    sourceUrl: source_url,
    isPublic: is_public,
  });

  return NextResponse.json({ id: deckId, unmatched }, { status: 201 });
}
