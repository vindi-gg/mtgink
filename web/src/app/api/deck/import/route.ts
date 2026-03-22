import { NextRequest, NextResponse } from "next/server";
import { parseDeckList, extractMoxfieldDeckId } from "@/lib/deck";
import { lookupDeckCards } from "@/lib/queries";
import { createAnonymousDeck } from "@/lib/deck-queries";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { decklist, url } = body as { decklist?: string; url?: string };

  // Get logged-in user if any
  let userId: string | null = null;
  const supabase = await createClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  // Moxfield URL → queue for rate-limited processing
  if (url && typeof url === "string") {
    const moxId = extractMoxfieldDeckId(url);
    if (!moxId) {
      return NextResponse.json(
        { error: "Unsupported URL. Currently only Moxfield links are supported." },
        { status: 400 }
      );
    }

    if (!process.env.MOXFIELD_USER_AGENT) {
      return NextResponse.json(
        { error: "Moxfield API not configured. Try pasting the decklist instead.", fallback: true },
        { status: 422 }
      );
    }

    const admin = getAdminClient();

    // Insert into queue
    const { data: queueEntry, error: insertErr } = await admin
      .from("moxfield_queue")
      .insert({ moxfield_deck_id: moxId, deck_url: url, status: "pending", user_id: userId })
      .select("id")
      .single();

    if (insertErr || !queueEntry) {
      return NextResponse.json({ error: "Failed to queue import" }, { status: 500 });
    }

    return NextResponse.json({
      queued: true,
      queueId: queueEntry.id,
      position: 1,
    });
  }

  // Decklist text → process immediately
  if (decklist && typeof decklist === "string") {
    const entries = parseDeckList(decklist);

    if (entries.length === 0) {
      return NextResponse.json({ error: "No cards found in decklist" }, { status: 400 });
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
      name: "Imported Deck",
      userId,
      cards: deckCards,
    });

    return NextResponse.json({
      deckId,
      stats: {
        total: entries.length,
        matched: matched.length,
        unmatched: unmatched.length,
      },
    });
  }

  return NextResponse.json(
    { error: "Provide either a decklist or a Moxfield URL" },
    { status: 400 }
  );
}
