import { NextRequest, NextResponse } from "next/server";
import { extractMoxfieldDeckId } from "@/lib/deck";
import { getDeckById } from "@/lib/deck-queries";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ deckId: string }> }
) {
  const { deckId } = await params;

  const deck = await getDeckById(deckId);
  if (!deck) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }

  if (!deck.source_url) {
    return NextResponse.json({ error: "Deck has no source URL to sync from" }, { status: 400 });
  }

  const moxId = extractMoxfieldDeckId(deck.source_url);
  if (!moxId) {
    return NextResponse.json({ error: "Only Moxfield decks can be synced" }, { status: 400 });
  }

  if (!process.env.MOXFIELD_USER_AGENT) {
    return NextResponse.json({ error: "Moxfield API not configured" }, { status: 422 });
  }

  const admin = getAdminClient();

  const { data: queueEntry, error: insertErr } = await admin
    .from("moxfield_queue")
    .insert({
      moxfield_deck_id: moxId,
      deck_url: deck.source_url,
      status: "pending",
      target_deck_id: deckId,
    })
    .select("id")
    .single();

  if (insertErr || !queueEntry) {
    return NextResponse.json({ error: "Failed to queue sync" }, { status: 500 });
  }

  return NextResponse.json({
    queued: true,
    queueId: queueEntry.id,
  });
}
