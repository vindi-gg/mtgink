import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  lookupCardsByNames,
} from "./queries";
import type {
  Deck,
  DeckSummary,
  DeckCard,
  DeckCardDetail,
  DeckDetail,
  DecklistEntry,
  Illustration,
  ArtRating,
  PurchaseListItem,
} from "./types";

export async function createDeck(params: {
  userId: string | null;
  name: string;
  format?: string;
  sourceUrl?: string;
  isPublic?: boolean;
}): Promise<string> {
  // Use admin client so anon users can create decks too
  const { data, error } = await getAdminClient()
    .from("decks")
    .insert({
      user_id: params.userId,
      name: params.name,
      format: params.format ?? null,
      source_url: params.sourceUrl ?? null,
      is_public: params.isPublic !== false,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create deck: ${error.message}`);
  return data.id;
}

export async function getDecksByUser(
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ decks: DeckSummary[]; total: number }> {
  const supabase = await createClient();
  if (!supabase) return { decks: [], total: 0 };

  const { count } = await supabase
    .from("decks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const { data } = await supabase
    .from("decks")
    .select("*, deck_cards(quantity, oracle_id)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const decks: DeckSummary[] = (data ?? []).map((d) => {
    const cards = (d.deck_cards ?? []) as { quantity: number; oracle_id: string }[];
    return {
      id: d.id,
      user_id: d.user_id,
      name: d.name,
      format: d.format,
      source_url: d.source_url,
      is_public: d.is_public,
      created_at: d.created_at,
      updated_at: d.updated_at,
      card_count: cards.reduce((sum, c) => sum + c.quantity, 0),
      unique_cards: cards.length,
    };
  });

  return { decks, total: count ?? 0 };
}

export async function getDeckById(deckId: string): Promise<Deck | null> {
  const { data } = await getAdminClient()
    .from("decks")
    .select("*")
    .eq("id", deckId)
    .single();
  return data as Deck | null;
}

export async function updateDeck(
  deckId: string,
  updates: { name?: string; format?: string; isPublic?: boolean }
): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.format !== undefined) updateData.format = updates.format;
  if (updates.isPublic !== undefined) updateData.is_public = updates.isPublic;

  await supabase
    .from("decks")
    .update(updateData)
    .eq("id", deckId);
}

export async function deleteDeck(deckId: string): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.from("decks").delete().eq("id", deckId);
}

export async function setDeckCards(
  deckId: string,
  cards: { oracleId: string; quantity: number; section: string }[]
): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;

  // Delete existing cards
  await supabase.from("deck_cards").delete().eq("deck_id", deckId);

  // Insert new cards
  if (cards.length > 0) {
    await supabase.from("deck_cards").insert(
      cards.map((c) => ({
        deck_id: deckId,
        oracle_id: c.oracleId,
        quantity: c.quantity,
        section: c.section,
      }))
    );
  }

  // Update deck timestamp
  await supabase
    .from("decks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", deckId);
}

export async function getDeckDetail(deckId: string): Promise<DeckDetail | null> {
  const deck = await getDeckById(deckId);
  if (!deck) return null;

  const { data: deckCards } = await getAdminClient()
    .from("deck_cards")
    .select("*")
    .eq("deck_id", deckId);

  const dcs = (deckCards ?? []) as DeckCard[];
  if (dcs.length === 0) return { ...deck, cards: [], unmatched: [] };

  const oracleIds = dcs.map((dc) => dc.oracle_id);
  const admin = getAdminClient();

  // 3 parallel queries: oracle cards, illustrations (with prices), ratings
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [{ data: oracleRows }, { data: illRows }, { data: allRatings }] = await Promise.all([
    admin.from("oracle_cards")
      .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc")
      .in("oracle_id", oracleIds),
    admin.rpc("get_illustrations_for_cards", { p_oracle_ids: oracleIds }),
    admin.from("art_ratings")
      .select("illustration_id, oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at")
      .in("oracle_id", oracleIds),
  ]);

  const oracleMap = new Map<string, any>(
    (oracleRows ?? []).map((r: any) => [r.oracle_id, { ...r, colors: r.colors ? JSON.stringify(r.colors) : null }])
  );

  const ratingMap = new Map<string, ArtRating>(
    (allRatings ?? []).map((r: any) => [r.illustration_id, r as ArtRating])
  );

  // Group illustrations by oracle_id, track total count
  const illustrationsByOracle = new Map<string, (Illustration & { cheapest_price: number | null })[]>();
  const illustrationCountByOracle = new Map<string, number>();
  for (const row of (illRows ?? []) as any[]) {
    const oId = row.oracle_id as string;
    if (!illustrationsByOracle.has(oId)) illustrationsByOracle.set(oId, []);
    illustrationsByOracle.get(oId)!.push({
      illustration_id: row.illustration_id,
      oracle_id: oId,
      artist: row.artist,
      set_code: row.set_code,
      set_name: row.set_name,
      collector_number: row.collector_number,
      released_at: row.released_at,
      image_version: row.image_version,
      cheapest_price: row.cheapest_price != null ? Number(row.cheapest_price) : null,
    });
    if (row.total_for_card != null) illustrationCountByOracle.set(oId, Number(row.total_for_card));
  }

  // DFC back faces: find latest printing per DFC card, then fetch back face
  const dfcOracleIds: string[] = [];
  for (const dc of dcs) {
    const card = oracleMap.get(dc.oracle_id);
    if (!card) continue;
    if (card.layout === "modal_dfc" || card.layout === "transform" || card.layout === "reversible_card") {
      dfcOracleIds.push(dc.oracle_id);
    }
  }
  const dfcBackFaces = new Map<string, string>();
  if (dfcOracleIds.length > 0) {
    const { data: dfcPrintings } = await admin.from("printings")
      .select("oracle_id, scryfall_id, released_at")
      .in("oracle_id", dfcOracleIds)
      .order("released_at", { ascending: false });
    // Pick latest printing per oracle_id
    const latestByOracle = new Map<string, string>();
    for (const p of (dfcPrintings ?? []) as any[]) {
      if (!latestByOracle.has(p.oracle_id)) latestByOracle.set(p.oracle_id, p.scryfall_id);
    }
    const dfcScryfallIds = [...latestByOracle.values()];
    if (dfcScryfallIds.length > 0) {
      const { data: faces } = await admin.from("card_faces")
        .select("scryfall_id, image_uris")
        .eq("face_index", 1)
        .in("scryfall_id", dfcScryfallIds);
      const scryfallToOracle = new Map<string, string>();
      for (const [oid, sid] of latestByOracle) scryfallToOracle.set(sid, oid);
      for (const face of (faces ?? []) as any[]) {
        const oid = scryfallToOracle.get(face.scryfall_id);
        if (oid && face.image_uris?.normal) dfcBackFaces.set(oid, face.image_uris.normal);
      }
    }
  }

  // Assemble results
  const cards: DeckCardDetail[] = [];
  const unmatched: string[] = [];
  for (const dc of dcs) {
    const card = oracleMap.get(dc.oracle_id);
    if (!card) { unmatched.push(dc.oracle_id); continue; }

    const ills = (illustrationsByOracle.get(dc.oracle_id) ?? [])
      .map((ill) => ({
        ...ill,
        rating: ratingMap.get(ill.illustration_id) ?? null,
      }))
      .sort((a, b) => (b.rating?.elo_rating ?? 1500) - (a.rating?.elo_rating ?? 1500));

    cards.push({
      ...dc,
      card,
      illustrations: ills,
      illustration_count: illustrationCountByOracle.get(dc.oracle_id) ?? ills.length,
      back_face_url: dfcBackFaces.get(dc.oracle_id) ?? null,
    } as DeckCardDetail);
  }

  return { ...deck, cards, unmatched };
}

export async function updateDeckCard(
  deckId: string,
  oracleId: string,
  updates: { selected_illustration_id?: string; to_buy?: boolean }
): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;

  const updateData: Record<string, unknown> = {};
  if (updates.selected_illustration_id !== undefined)
    updateData.selected_illustration_id = updates.selected_illustration_id;
  if (updates.to_buy !== undefined) updateData.to_buy = updates.to_buy;

  if (Object.keys(updateData).length === 0) return;

  await supabase
    .from("deck_cards")
    .update(updateData)
    .eq("deck_id", deckId)
    .eq("oracle_id", oracleId);

  await supabase
    .from("decks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", deckId);
}

export async function updateDeckCardAdmin(
  deckId: string,
  oracleId: string,
  updates: { selected_illustration_id?: string; to_buy?: boolean }
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.selected_illustration_id !== undefined)
    updateData.selected_illustration_id = updates.selected_illustration_id;
  if (updates.to_buy !== undefined) updateData.to_buy = updates.to_buy;

  if (Object.keys(updateData).length === 0) return;

  await getAdminClient()
    .from("deck_cards")
    .update(updateData)
    .eq("deck_id", deckId)
    .eq("oracle_id", oracleId);

  await getAdminClient()
    .from("decks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", deckId);
}

export async function getUserPurchaseList(userId: string): Promise<PurchaseListItem[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data: rows } = await supabase
    .from("deck_cards")
    .select("deck_id, oracle_id, selected_illustration_id, decks!inner(name, user_id)")
    .eq("to_buy", true)
    .eq("decks.user_id", userId);

  if (!rows || rows.length === 0) return [];

  // Batch lookups
  const oracleIds = [...new Set(rows.map((r) => r.oracle_id))];
  const illustrationIds = rows
    .map((r) => r.selected_illustration_id)
    .filter((id): id is string => id != null);

  const [{ data: cards }, { data: printingRows }] = await Promise.all([
    getAdminClient()
      .from("oracle_cards")
      .select("oracle_id, name, slug")
      .in("oracle_id", oracleIds),
    illustrationIds.length > 0
      ? getAdminClient()
          .from("printings")
          .select("illustration_id, oracle_id, artist, set_code, collector_number, tcgplayer_id, image_version")
          .in("illustration_id", illustrationIds)
      : Promise.resolve({ data: [] as { illustration_id: string; oracle_id: string; artist: string; set_code: string; collector_number: string; tcgplayer_id: number | null; image_version: string | null }[] }),
  ]);

  const cardMap = new Map((cards ?? []).map((c) => [c.oracle_id, c]));
  const printingMap = new Map((printingRows ?? []).map((p) => [p.illustration_id, p]));

  const items: PurchaseListItem[] = [];
  for (const row of rows) {
    const card = cardMap.get(row.oracle_id);
    if (!card) continue;

    const deck = row.decks as unknown as { name: string; user_id: string };
    let printing = row.selected_illustration_id
      ? printingMap.get(row.selected_illustration_id)
      : undefined;

    // Fallback: get default printing if no selected illustration
    if (!printing) {
      const { data: defaultPrinting } = await getAdminClient()
        .from("printings")
        .select("illustration_id, oracle_id, artist, set_code, collector_number, tcgplayer_id, image_version")
        .eq("oracle_id", row.oracle_id)
        .order("released_at", { ascending: false })
        .limit(1)
        .single();
      printing = defaultPrinting ?? undefined;
    }

    items.push({
      deck_id: row.deck_id,
      deck_name: deck.name,
      oracle_id: row.oracle_id,
      card_name: card.name,
      card_slug: card.slug,
      illustration_id: row.selected_illustration_id ?? (printing as { illustration_id?: string })?.illustration_id ?? null,
      artist: printing?.artist ?? "Unknown",
      set_code: printing?.set_code ?? "",
      collector_number: printing?.collector_number ?? "",
      image_version: printing?.image_version ?? null,
      tcgplayer_id: printing?.tcgplayer_id ?? null,
    });
  }

  return items;
}

export async function createAnonymousDeck(params: {
  name: string;
  format?: string;
  sourceUrl?: string;
  userId?: string | null;
  cards: { oracleId: string; quantity: number; section: string; selectedIllustrationId?: string; originalSetCode?: string; originalCollectorNumber?: string; originalIsFoil?: boolean }[];
}): Promise<string> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("decks")
    .insert({
      user_id: params.userId ?? null,
      name: params.name,
      format: params.format ?? null,
      source_url: params.sourceUrl ?? null,
      is_public: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create deck: ${error.message}`);
  const deckId = data.id;

  if (params.cards.length > 0) {
    await admin.from("deck_cards").insert(
      params.cards.map((c) => ({
        deck_id: deckId,
        oracle_id: c.oracleId,
        quantity: c.quantity,
        section: c.section,
        selected_illustration_id: c.selectedIllustrationId ?? null,
        original_set_code: c.originalSetCode ?? null,
        original_collector_number: c.originalCollectorNumber ?? null,
        original_is_foil: c.originalIsFoil ?? false,
      }))
    );
  }

  return deckId;
}

/** Re-sync deck cards from a fresh import, preserving art selections and to_buy flags */
export async function syncDeckCards(
  deckId: string,
  newCards: { oracleId: string; quantity: number; section: string; originalSetCode?: string; originalCollectorNumber?: string; originalIsFoil?: boolean }[]
): Promise<void> {
  const admin = getAdminClient();

  // Get existing cards to preserve selections
  const { data: existing } = await admin
    .from("deck_cards")
    .select("oracle_id, selected_illustration_id, to_buy")
    .eq("deck_id", deckId);

  const preservedMap = new Map(
    (existing ?? []).map((c) => [c.oracle_id, { selected_illustration_id: c.selected_illustration_id, to_buy: c.to_buy }])
  );

  // Delete all existing cards
  await admin.from("deck_cards").delete().eq("deck_id", deckId);

  // Insert new cards with preserved selections
  if (newCards.length > 0) {
    await admin.from("deck_cards").insert(
      newCards.map((c) => {
        const preserved = preservedMap.get(c.oracleId);
        return {
          deck_id: deckId,
          oracle_id: c.oracleId,
          quantity: c.quantity,
          section: c.section,
          selected_illustration_id: preserved?.selected_illustration_id ?? null,
          to_buy: preserved?.to_buy ?? false,
          original_set_code: c.originalSetCode ?? null,
          original_collector_number: c.originalCollectorNumber ?? null,
          original_is_foil: c.originalIsFoil ?? false,
        };
      })
    );
  }

  // Update deck timestamp
  await admin
    .from("decks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", deckId);
}

export async function lookupAndCreateDeck(
  userId: string | null,
  name: string,
  entries: DecklistEntry[],
  options?: { format?: string; sourceUrl?: string; isPublic?: boolean }
): Promise<{ deckId: string; unmatched: string[] }> {
  // Batch lookup all card names in one query
  const [deckId, cardMap] = await Promise.all([
    createDeck({
      userId,
      name,
      format: options?.format,
      sourceUrl: options?.sourceUrl,
      isPublic: options?.isPublic,
    }),
    lookupCardsByNames(entries.map((e) => e.name)),
  ]);

  const cards: { oracleId: string; quantity: number; section: string }[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const card = cardMap.get(entry.name.toLowerCase());
    if (!card) {
      unmatched.push(entry.name);
      continue;
    }
    if (seen.has(card.oracle_id)) continue;
    seen.add(card.oracle_id);
    cards.push({
      oracleId: card.oracle_id,
      quantity: entry.quantity,
      section: entry.section,
    });
  }

  await setDeckCards(deckId, cards);
  return { deckId, unmatched };
}
