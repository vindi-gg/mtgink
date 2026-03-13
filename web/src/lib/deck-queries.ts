import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getIllustrationsForCard,
  getRatingsForCard,
  getCardByOracleId,
  lookupCardByName,
} from "./queries";
import type {
  Deck,
  DeckSummary,
  DeckCard,
  DeckCardDetail,
  DeckDetail,
  DecklistEntry,
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

  const cards: DeckCardDetail[] = [];
  const unmatched: string[] = [];

  for (const dc of (deckCards ?? []) as DeckCard[]) {
    const card = await getCardByOracleId(dc.oracle_id);
    if (!card) {
      unmatched.push(dc.oracle_id);
      continue;
    }

    const [illustrations, ratings] = await Promise.all([
      getIllustrationsForCard(dc.oracle_id),
      getRatingsForCard(dc.oracle_id),
    ]);
    const ratingMap = new Map(ratings.map((r) => [r.illustration_id, r]));

    // Get cheapest price per illustration
    const illIds = illustrations.map((ill) => ill.illustration_id);
    const priceMap = new Map<string, number>();
    if (illIds.length > 0) {
      // Get all printings for these illustrations
      const { data: printings } = await getAdminClient()
        .from("printings")
        .select("scryfall_id, illustration_id")
        .in("illustration_id", illIds);
      if (printings && printings.length > 0) {
        const scryfallIds = printings.map((p) => p.scryfall_id);
        const { data: prices } = await getAdminClient()
          .from("best_prices")
          .select("scryfall_id, market_price")
          .in("scryfall_id", scryfallIds);
        if (prices) {
          // Map scryfall_id -> illustration_id
          const scryfallToIll = new Map<string, string>();
          for (const p of printings) {
            scryfallToIll.set(p.scryfall_id, p.illustration_id);
          }
          // Find cheapest price per illustration
          for (const p of prices) {
            const illId = scryfallToIll.get(p.scryfall_id);
            if (illId && p.market_price != null) {
              const existing = priceMap.get(illId);
              if (existing === undefined || p.market_price < existing) {
                priceMap.set(illId, p.market_price);
              }
            }
          }
        }
      }
    }

    const illustrationsWithRatings = illustrations
      .map((ill) => ({
        ...ill,
        rating: ratingMap.get(ill.illustration_id) ?? null,
        cheapest_price: priceMap.get(ill.illustration_id) ?? null,
      }))
      .sort((a, b) => {
        const aElo = a.rating?.elo_rating ?? 1500;
        const bElo = b.rating?.elo_rating ?? 1500;
        return bElo - aElo;
      });

    // Get back face URL for DFCs
    const isDFC = card.layout === "modal_dfc" || card.layout === "transform" || card.layout === "reversible_card";
    let backFaceUrl: string | null = null;
    if (isDFC && illustrations.length > 0) {
      const { data: backFace } = await getAdminClient()
        .from("card_faces")
        .select("image_uris")
        .eq("scryfall_id", (await getAdminClient()
          .from("printings")
          .select("scryfall_id")
          .eq("oracle_id", dc.oracle_id)
          .order("released_at", { ascending: false })
          .limit(1)
          .single()).data?.scryfall_id ?? "")
        .eq("face_index", 1)
        .maybeSingle();
      if (backFace?.image_uris) {
        const uris = backFace.image_uris as { normal?: string };
        backFaceUrl = uris.normal ?? null;
      }
    }

    cards.push({
      ...dc,
      card,
      illustrations: illustrationsWithRatings,
      back_face_url: backFaceUrl,
    });
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
  const deckId = await createDeck({
    userId,
    name,
    format: options?.format,
    sourceUrl: options?.sourceUrl,
    isPublic: options?.isPublic,
  });

  const cards: { oracleId: string; quantity: number; section: string }[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const card = await lookupCardByName(entry.name);
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
