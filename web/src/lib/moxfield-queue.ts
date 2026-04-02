import { parseMoxfieldResponse } from "@/lib/deck";
import { lookupDeckCards } from "@/lib/queries";
import { createAnonymousDeck, syncDeckCards } from "@/lib/deck-queries";
import { getAdminClient } from "@/lib/supabase/admin";

export async function tryProcessQueue() {
  const tq = Date.now();
  const admin = getAdminClient();

  // Recover stuck jobs (processing > 30s = crashed)
  await admin
    .from("moxfield_queue")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("created_at", new Date(Date.now() - 30000).toISOString());

  // Try to acquire lock (only if last lock was > 1s ago)
  const { data: lock } = await admin
    .from("moxfield_lock")
    .update({ locked_at: new Date().toISOString(), locked_by: crypto.randomUUID() })
    .eq("key", "processor")
    .lt("locked_at", new Date(Date.now() - 1000).toISOString())
    .select("locked_by")
    .single();

  if (!lock) { console.log(`[moxfield] no lock acquired: ${Date.now() - tq}ms`); return; }

  // Find oldest pending entry
  const { data: pending } = await admin
    .from("moxfield_queue")
    .select("id, moxfield_deck_id, deck_url, target_deck_id, user_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!pending) { console.log(`[moxfield] no pending jobs: ${Date.now() - tq}ms`); return; }
  console.log(`[moxfield] queue overhead: ${Date.now() - tq}ms`);

  // Mark it processing
  await admin
    .from("moxfield_queue")
    .update({ status: "processing" })
    .eq("id", pending.id);

  try {
    const t0 = Date.now();
    const moxUA = process.env.MOXFIELD_USER_AGENT;
    if (!moxUA) throw new Error("MOXFIELD_USER_AGENT not configured");

    const res = await fetch(
      `https://api2.moxfield.com/v3/decks/all/${pending.moxfield_deck_id}`,
      { headers: { "User-Agent": moxUA, Accept: "application/json" } }
    );
    console.log(`[moxfield] fetch: ${Date.now() - t0}ms`);

    if (!res.ok) {
      throw new Error(`Moxfield returned ${res.status}`);
    }

    const moxData = await res.json();
    const t1 = Date.now();
    const entries = parseMoxfieldResponse(moxData);
    console.log(`[moxfield] parse ${entries.length} entries: ${Date.now() - t1}ms`);

    if (entries.length === 0) {
      throw new Error("No cards found in Moxfield deck");
    }

    const t2 = Date.now();
    const { matched, unmatched } = await lookupDeckCards(entries);
    console.log(`[moxfield] lookupDeckCards (${matched.length} matched, ${unmatched.length} unmatched): ${Date.now() - t2}ms`);

    const deckCards = matched.map((card) => ({
      oracleId: card.card.oracle_id,
      quantity: card.quantity,
      section: card.section || "Mainboard",
      originalSetCode: card.original_set_code,
      originalCollectorNumber: card.original_collector_number,
      originalIsFoil: card.original_is_foil,
    }));

    let deckId: string;

    const t3 = Date.now();
    if (pending.target_deck_id) {
      deckId = pending.target_deck_id;
      await syncDeckCards(deckId, deckCards);
      console.log(`[moxfield] syncDeckCards: ${Date.now() - t3}ms`);
    } else {
      deckId = await createAnonymousDeck({
        name: moxData.name || "Imported Deck",
        format: moxData.format || undefined,
        sourceUrl: pending.deck_url,
        userId: pending.user_id,
        cards: deckCards,
      });
      console.log(`[moxfield] createDeck: ${Date.now() - t3}ms`);
    }

    const t4 = Date.now();
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
    console.log(`[moxfield] update status: ${Date.now() - t4}ms | total: ${Date.now() - t0}ms`);
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
