import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDeckDetail, getDeckById, updateDeck, deleteDeck, setDeckCards } from "@/lib/deck-queries";
import { lookupCardByName } from "@/lib/queries";
import type { DecklistEntry } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ deckId: string }> }
) {
  const { deckId } = await params;
  const deck = getDeckById(deckId);
  if (!deck) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }

  // Private decks require ownership
  if (!deck.is_public) {
    const supabase = await createClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (!user || user.id !== deck.user_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // Check if current user is the owner
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const isOwner = user?.id === deck.user_id;

  const detail = getDeckDetail(deckId);
  return NextResponse.json({ ...detail, is_owner: isOwner });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ deckId: string }> }
) {
  const { deckId } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deck = getDeckById(deckId);
  if (!deck || deck.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, format, is_public, cards } = body as {
    name?: string;
    format?: string;
    is_public?: boolean;
    cards?: DecklistEntry[];
  };

  updateDeck(deckId, { name, format, isPublic: is_public });

  if (cards && Array.isArray(cards)) {
    const cardEntries: { oracleId: string; quantity: number; section: string }[] = [];
    for (const entry of cards) {
      const card = lookupCardByName(entry.name);
      if (card) {
        cardEntries.push({
          oracleId: card.oracle_id,
          quantity: entry.quantity,
          section: entry.section,
        });
      }
    }
    setDeckCards(deckId, cardEntries);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ deckId: string }> }
) {
  const { deckId } = await params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deck = getDeckById(deckId);
  if (!deck || deck.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  deleteDeck(deckId);
  return NextResponse.json({ ok: true });
}
