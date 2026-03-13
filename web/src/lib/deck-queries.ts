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

  // Round 1: 3 bulk queries in parallel
  const [{ data: oracleRows }, { data: allPrintings }, { data: allRatings }] = await Promise.all([
    admin.from("oracle_cards")
      .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc")
      .in("oracle_id", oracleIds),
    admin.from("printings")
      .select("scryfall_id, illustration_id, oracle_id, artist, set_code, collector_number, released_at, image_version, has_image, sets!inner(name, digital, set_type)")
      .in("oracle_id", oracleIds)
      .not("illustration_id", "is", null)
      .limit(10000),
    admin.from("art_ratings")
      .select("illustration_id, oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at")
      .in("oracle_id", oracleIds),
  ]);

  // Oracle card map
  const oracleMap = new Map<string, any>(
    (oracleRows ?? []).map((r: any) => [r.oracle_id, { ...r, colors: r.colors ? JSON.stringify(r.colors) : null }])
  );

  // Rating map: illustration_id → ArtRating
  const ratingMap = new Map<string, ArtRating>(
    (allRatings ?? []).map((r: any) => [r.illustration_id, r as ArtRating])
  );

  // Deduplicate printings into illustrations (replicates get_illustrations_for_card RPC logic)
  const SET_TYPE_PRIORITY: Record<string, number> = {
    expansion: 1, core: 2, masters: 3, draft_innovation: 4, commander: 5,
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const displayPrintings = (allPrintings ?? [])
    .filter((p: any) => p.has_image && p.sets && !p.sets.digital)
    .sort((a: any, b: any) => {
      const aPri = SET_TYPE_PRIORITY[a.sets.set_type] ?? 6;
      const bPri = SET_TYPE_PRIORITY[b.sets.set_type] ?? 6;
      if (aPri !== bPri) return aPri - bPri;
      return (a.released_at ?? "").localeCompare(b.released_at ?? "");
    });

  const seenIll = new Set<string>();
  const illustrationsByOracle = new Map<string, Illustration[]>();
  for (const p of displayPrintings) {
    const illId = p.illustration_id as string;
    if (seenIll.has(illId)) continue;
    seenIll.add(illId);
    const ill: Illustration = {
      illustration_id: illId,
      oracle_id: p.oracle_id as string,
      artist: p.artist as string,
      set_code: p.set_code as string,
      set_name: (p as any).sets.name as string,
      collector_number: p.collector_number as string,
      released_at: (p.released_at as string) ?? null,
      image_version: (p.image_version as string) ?? null,
    };
    if (!illustrationsByOracle.has(p.oracle_id as string)) illustrationsByOracle.set(p.oracle_id as string, []);
    illustrationsByOracle.get(p.oracle_id as string)!.push(ill);
  }

  // Map scryfall_id → illustration_id for price lookups (all printings of valid illustrations)
  const scryfallToIll = new Map<string, string>();
  for (const p of (allPrintings ?? [])) {
    if (seenIll.has(p.illustration_id as string)) {
      scryfallToIll.set(p.scryfall_id as string, p.illustration_id as string);
    }
  }

  // Identify DFC cards and their latest printing
  const dfcLatest = new Map<string, { scryfall_id: string; released_at: string }>();
  for (const dc of dcs) {
    const card = oracleMap.get(dc.oracle_id);
    if (!card) continue;
    const layout = card.layout as string;
    if (layout === "modal_dfc" || layout === "transform" || layout === "reversible_card") {
      // Find latest printing for this oracle_id
      for (const p of (allPrintings ?? [])) {
        if ((p.oracle_id as string) !== dc.oracle_id) continue;
        const existing = dfcLatest.get(dc.oracle_id);
        if (!existing || ((p.released_at as string) ?? "") > existing.released_at) {
          dfcLatest.set(dc.oracle_id, { scryfall_id: p.scryfall_id as string, released_at: (p.released_at as string) ?? "" });
        }
      }
    }
  }

  // Round 2: prices + DFC faces in parallel
  const allScryfallIds = [...scryfallToIll.keys()];
  const BATCH = 300;
  const pricePromises: Promise<any>[] = [];
  for (let i = 0; i < allScryfallIds.length; i += BATCH) {
    pricePromises.push(
      Promise.resolve(admin.from("best_prices").select("scryfall_id, market_price").in("scryfall_id", allScryfallIds.slice(i, i + BATCH)))
    );
  }
  const dfcScryfallIds = [...dfcLatest.values()].map((v) => v.scryfall_id);
  const [priceResults, dfcResult] = await Promise.all([
    Promise.all(pricePromises),
    dfcScryfallIds.length > 0
      ? admin.from("card_faces").select("scryfall_id, image_uris").eq("face_index", 1).in("scryfall_id", dfcScryfallIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // Cheapest price per illustration
  const priceMap = new Map<string, number>();
  for (const { data } of priceResults) {
    for (const p of (data ?? [])) {
      const illId = scryfallToIll.get(p.scryfall_id);
      if (illId && p.market_price != null) {
        const existing = priceMap.get(illId);
        if (existing === undefined || p.market_price < existing) priceMap.set(illId, p.market_price);
      }
    }
  }

  // DFC back face URLs
  const dfcBackFaces = new Map<string, string>();
  if (dfcResult.data) {
    const scryfallToOracle = new Map<string, string>();
    for (const [oid, info] of dfcLatest) scryfallToOracle.set(info.scryfall_id, oid);
    for (const face of dfcResult.data as any[]) {
      const oid = scryfallToOracle.get(face.scryfall_id);
      if (oid && face.image_uris) {
        const url = face.image_uris.normal;
        if (url) dfcBackFaces.set(oid, url);
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
        cheapest_price: priceMap.get(ill.illustration_id) ?? null,
      }))
      .sort((a, b) => (b.rating?.elo_rating ?? 1500) - (a.rating?.elo_rating ?? 1500));

    cards.push({
      ...dc,
      card,
      illustrations: ills,
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
  cards: { oracleId: string; quantity: number; section: string; selectedIllustrationId?: string; originalSetCode?: string; originalCollectorNumber?: string; originalIsFoil?: boolean }[];
}): Promise<string> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("decks")
    .insert({
      user_id: null,
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
