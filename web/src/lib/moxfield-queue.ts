import { parseMoxfieldResponse } from "@/lib/deck";
import { lookupDeckCards } from "@/lib/queries";
import { createAnonymousDeck } from "@/lib/deck-queries";
import { getAdminClient } from "@/lib/supabase/admin";

export async function tryProcessQueue() {
  const admin = getAdminClient();

  // Try to acquire lock (only if last lock was > 1s ago)
  const { data: lock } = await admin
    .from("moxfield_lock")
    .update({ locked_at: new Date().toISOString(), locked_by: crypto.randomUUID() })
    .eq("key", "processor")
    .lt("locked_at", new Date(Date.now() - 1000).toISOString())
    .select("locked_by")
    .single();

  if (!lock) return;

  // Find oldest pending entry
  const { data: pending } = await admin
    .from("moxfield_queue")
    .select("id, moxfield_deck_id, deck_url")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!pending) return;

  // Mark it processing
  await admin
    .from("moxfield_queue")
    .update({ status: "processing" })
    .eq("id", pending.id);

  try {
    const moxUA = process.env.MOXFIELD_USER_AGENT;
    if (!moxUA) throw new Error("MOXFIELD_USER_AGENT not configured");

    const res = await fetch(
      `https://api2.moxfield.com/v3/decks/all/${pending.moxfield_deck_id}`,
      { headers: { "User-Agent": moxUA, Accept: "application/json" } }
    );

    if (!res.ok) {
      throw new Error(`Moxfield returned ${res.status}`);
    }

    const moxData = await res.json();
    const entries = parseMoxfieldResponse(moxData);

    if (entries.length === 0) {
      throw new Error("No cards found in Moxfield deck");
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
      name: moxData.name || "Imported Deck",
      format: moxData.format || undefined,
      sourceUrl: pending.deck_url,
      cards: deckCards,
    });

    await admin
      .from("moxfield_queue")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        result: {
          deckId,
          stats: { total: entries.length, matched: matched.length, unmatched: unmatched.length },
        },
      })
      .eq("id", pending.id);
  } catch (err) {
    await admin
      .from("moxfield_queue")
      .update({
        status: "error",
        completed_at: new Date().toISOString(),
        error_message: err instanceof Error ? err.message : "Unknown error",
      })
      .eq("id", pending.id);
  }
}
