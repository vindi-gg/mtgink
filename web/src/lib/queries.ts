import { getAdminClient } from "@/lib/supabase/admin";
import type {
  OracleCard,
  Illustration,
  Printing,
  ArtRating,
  ComparisonPair,
  CompareFilters,
  VotePayload,
  MtgSet,
  SetCard,
  DecklistEntry,
  DeckCardWithArt,
  ClashCard,
  ClashPair,
  CardRating,
  CardVotePayload,
  GauntletEntry,
  Artist,
  ArtistStats,
  ArtistIllustration,
  Tribe,
  Tag,
  BrowseCard,
  DailyChallenge,
  DailyChallengeStats,
  DailyChallengeWithStatus,
  GauntletTheme,
  CardFace,
} from "./types";

/** Row shape returned by get_comparison_pair / get_cross_comparison_pair RPCs */
interface IllustrationWithRating {
  illustration_id: string;
  oracle_id: string;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  released_at: string;
  elo_rating: number | null;
  vote_count: number | null;
  win_count: number | null;
  loss_count: number | null;
  image_version: string | null;
}

function toIllustration(row: IllustrationWithRating): Illustration {
  return {
    illustration_id: row.illustration_id,
    oracle_id: row.oracle_id,
    artist: row.artist,
    set_code: row.set_code,
    set_name: row.set_name,
    collector_number: row.collector_number,
    released_at: row.released_at,
    image_version: row.image_version ?? null,
  };
}

function toRating(row: IllustrationWithRating): ArtRating | null {
  if (row.elo_rating == null) return null;
  return {
    illustration_id: row.illustration_id,
    oracle_id: row.oracle_id,
    elo_rating: row.elo_rating,
    vote_count: row.vote_count ?? 0,
    win_count: row.win_count ?? 0,
    loss_count: row.loss_count ?? 0,
    updated_at: "",
  };
}

/** Convert a card name to a URL slug */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function filterParams(filters?: CompareFilters) {
  return {
    p_colors: filters?.colors?.length ? filters.colors : null,
    p_type: filters?.type || null,
    p_subtype: filters?.subtype || null,
    p_set_code: filters?.set_code || null,
    p_rules_text: filters?.rules_text || null,
  };
}

/** Layouts excluded from random pools (gauntlets, VS, remix) */
const EXCLUDED_LAYOUTS = new Set([
  "planar", "vanguard", "scheme", "emblem",
  "token", "double_faced_token", "art_series",
]);

/** Pick random cards directly in Postgres */
async function getRandomCards(count: number, minIllustrations: number, filters?: CompareFilters): Promise<OracleCard[]> {
  // Fetch extra to compensate for layout filtering
  const { data, error } = await getAdminClient().rpc("get_random_cards", {
    p_count: Math.ceil(count * 1.3),
    p_min_illustrations: minIllustrations,
    ...filterParams(filters),
  });

  if (error) throw new Error(`Failed to get random cards: ${error.message}`);
  if (!data || data.length === 0) throw new Error("No cards match the selected filters");

  return (data as { oracle_id: string; name: string; slug: string; layout: string | null; type_line: string | null; mana_cost: string | null; colors: unknown; cmc: number | null }[])
    .filter((r) => !EXCLUDED_LAYOUTS.has(r.layout ?? ""))
    .slice(0, count)
    .map((r) => ({
      oracle_id: r.oracle_id,
      name: r.name,
      slug: r.slug,
      layout: r.layout,
      type_line: r.type_line,
      mana_cost: r.mana_cost,
      colors: r.colors ? JSON.stringify(r.colors) : null,
      cmc: r.cmc,
      og_version: null,
    }));
}

/** Get a cross-card comparison pair: two different cards, one illustration each */
export async function getCrossCardPair(filters?: CompareFilters): Promise<ComparisonPair> {
  const cards = await getRandomCards(2, 1, filters);
  if (cards.length < 2) throw new Error("Not enough cards match the selected filters");

  const { data, error } = await getAdminClient().rpc("get_cross_comparison_pair", {
    p_oracle_id_a: cards[0].oracle_id,
    p_oracle_id_b: cards[1].oracle_id,
  });

  if (error || !data || data.length < 2) {
    throw new Error(`Failed to get cross comparison pair: ${error?.message ?? "insufficient data"}`);
  }

  const rowA = data.find((r: IllustrationWithRating) => r.oracle_id === cards[0].oracle_id) ?? data[0];
  const rowB = data.find((r: IllustrationWithRating) => r.oracle_id === cards[1].oracle_id) ?? data[1];

  return {
    card: cards[0],
    card_b: cards[1],
    a: toIllustration(rowA),
    b: toIllustration(rowB),
    a_rating: toRating(rowA),
    b_rating: toRating(rowB),
  };
}

/** Get all distinct illustrations for a card, picking one representative printing per illustration */
export async function getIllustrationsForCard(oracleId: string): Promise<(Illustration & { cheapest_price: number | null })[]> {
  const { data, error } = await getAdminClient().rpc("get_illustrations_for_card", {
    p_oracle_id: oracleId,
  });
  if (error) throw new Error(`Failed to get illustrations: ${error.message}`);
  return (data as any[]).map((row) => ({ ...row, cheapest_price: row.cheapest_price != null ? Number(row.cheapest_price) : null }));
}

/** Get ELO rating for an illustration, or null if unrated */
export async function getRating(illustrationId: string): Promise<ArtRating | null> {
  const { data } = await getAdminClient()
    .from("art_ratings")
    .select("*")
    .eq("illustration_id", illustrationId)
    .single();
  return data ?? null;
}

/** Build a comparison pair for a card - picks two random distinct illustrations */
export async function getComparisonPair(oracleId?: string, filters?: CompareFilters): Promise<ComparisonPair> {
  if (!oracleId && filters?.mode === "cross") {
    return getCrossCardPair(filters);
  }

  // Pick a random card with 2+ illustrations, or use the specified one
  const card = oracleId
    ? await getCardByOracleId(oracleId)
    : (await getRandomCards(1, 2, filters))[0];
  if (!card) throw new Error("No comparable card found");

  const { data, error } = await getAdminClient().rpc("get_comparison_pair", {
    p_oracle_id: card.oracle_id,
  });

  if (error) throw new Error(`Failed to get comparison pair: ${error.message}`);
  if (!data || data.length < 2) throw new Error("Card has fewer than 2 illustrations");

  return {
    card,
    a: toIllustration(data[0]),
    b: toIllustration(data[1]),
    a_rating: toRating(data[0]),
    b_rating: toRating(data[1]),
  };
}

/** Get a card by oracle_id */
export async function getCardByOracleId(oracleId: string): Promise<OracleCard | null> {
  const { data } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc, og_version")
    .eq("oracle_id", oracleId)
    .single();
  if (!data) return null;
  return { ...data, colors: data.colors ? JSON.stringify(data.colors) : null };
}

/** Get a card by URL slug, with UUID fallback */
export async function getCardBySlug(slug: string): Promise<OracleCard | null> {
  // UUID fallback
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(slug)) {
    return getCardByOracleId(slug);
  }

  // Direct slug lookup (slug is pre-computed in DB)
  const { data } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc, og_version")
    .eq("slug", slug)
    .maybeSingle();

  if (data) return { ...data, colors: data.colors ? JSON.stringify(data.colors) : null };

  // Fallback: try with -token suffix or oracle_id prefix disambiguation
  let searchSlug = slug;
  let oraclePrefix: string | null = null;
  const prefixMatch = slug.match(/^(.+)-([0-9a-f]{8})$/);
  if (prefixMatch) {
    oraclePrefix = prefixMatch[2];
    searchSlug = prefixMatch[1];
  }

  let wantToken = false;
  if (searchSlug.endsWith("-token")) {
    wantToken = true;
    searchSlug = searchSlug.slice(0, -6);
  }

  // Search by LIKE pattern on name
  const likePattern = `%${searchSlug.replace(/-/g, "%")}%`;
  const { data: candidates } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc, og_version")
    .ilike("name", likePattern);

  if (!candidates || candidates.length === 0) return null;

  let matches = candidates.filter((c) => slugify(c.name) === searchSlug);
  if (matches.length === 0) return null;
  if (matches.length === 1) {
    const m = matches[0];
    return { ...m, colors: m.colors ? JSON.stringify(m.colors) : null };
  }

  if (wantToken) {
    matches = matches.filter((c) => c.type_line?.startsWith("Token"));
  } else {
    const nonTokens = matches.filter((c) => !c.type_line?.startsWith("Token"));
    if (nonTokens.length > 0) matches = nonTokens;
  }

  if (oraclePrefix && matches.length > 1) {
    const prefixed = matches.filter((c) => c.oracle_id.startsWith(oraclePrefix!));
    if (prefixed.length > 0) matches = prefixed;
  }

  if (matches.length === 0) return null;
  const m = matches[0];
  return { ...m, colors: m.colors ? JSON.stringify(m.colors) : null };
}

/** Get all printings for a card, grouped by illustration_id (excludes digital-only sets) */
/** Non-English reprint sets to exclude from printings display */
const NON_ENGLISH_SETS = ["psal", "ps11", "ren", "rin", "fbb", "4bb", "bchr"];

export async function getPrintingsForCard(oracleId: string): Promise<Record<string, Printing[]>> {
  const { data, error } = await getAdminClient()
    .from("printings")
    .select("scryfall_id, illustration_id, set_code, collector_number, released_at, rarity, tcgplayer_id, image_version, sets!inner(name, digital)")
    .eq("oracle_id", oracleId)
    .not("illustration_id", "is", null)
    .eq("sets.digital", false)
    .not("set_code", "in", `(${NON_ENGLISH_SETS.join(",")})`)
    .order("released_at", { ascending: false });

  if (error) throw new Error(`Failed to get printings: ${error.message}`);

  const grouped: Record<string, Printing[]> = {};
  for (const row of data ?? []) {
    const illId = row.illustration_id as string;
    if (!grouped[illId]) grouped[illId] = [];
    grouped[illId].push({
      scryfall_id: row.scryfall_id,
      set_code: row.set_code,
      set_name: (row.sets as unknown as { name: string }).name,
      collector_number: row.collector_number,
      released_at: row.released_at,
      rarity: row.rarity,
      tcgplayer_id: row.tcgplayer_id,
      image_version: row.image_version,
    });
  }
  return grouped;
}

/** Get card faces for a DFC (one representative printing) */
export async function getCardFaces(oracleId: string): Promise<CardFace[]> {
  // Get one printing for this card
  const { data: printing } = await getAdminClient()
    .from("printings")
    .select("scryfall_id")
    .eq("oracle_id", oracleId)
    .order("released_at", { ascending: false })
    .limit(1)
    .single();
  if (!printing) return [];

  const { data } = await getAdminClient()
    .from("card_faces")
    .select("face_index, name, mana_cost, type_line, oracle_text, illustration_id, image_uris")
    .eq("scryfall_id", printing.scryfall_id)
    .order("face_index", { ascending: true });

  return (data ?? []) as CardFace[];
}

/** Get back face image URLs for all printings of a DFC, keyed by scryfall_id */
export async function getBackFaceUrls(oracleId: string): Promise<Record<string, string>> {
  const { data: printings } = await getAdminClient()
    .from("printings")
    .select("scryfall_id")
    .eq("oracle_id", oracleId);
  if (!printings || printings.length === 0) return {};

  const { data } = await getAdminClient()
    .from("card_faces")
    .select("scryfall_id, image_uris")
    .in("scryfall_id", printings.map((p) => p.scryfall_id))
    .eq("face_index", 1);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const uris = row.image_uris as { normal?: string } | null;
    if (uris?.normal) {
      map[row.scryfall_id] = uris.normal;
    }
  }
  return map;
}

/** Record a vote and update ELO ratings */
export async function recordVote(payload: VotePayload, kFactor?: number, scope = "remix"): Promise<{
  winnerRating: ArtRating;
  loserRating: ArtRating;
}> {
  const { data, error } = await getAdminClient().rpc("record_vote", {
    p_oracle_id: payload.oracle_id,
    p_winner_illustration_id: payload.winner_illustration_id,
    p_loser_illustration_id: payload.loser_illustration_id,
    p_session_id: payload.session_id,
    p_user_id: payload.user_id ?? null,
    p_vote_source: payload.vote_source ?? null,
    p_k_factor: kFactor ?? null,
    p_scope: scope,
  });

  if (error) throw new Error(`Failed to record vote: ${error.message}`);

  const row = (data as Record<string, unknown>[])[0];
  return {
    winnerRating: {
      illustration_id: row.winner_illustration_id as string,
      oracle_id: payload.oracle_id,
      elo_rating: row.winner_elo as number,
      vote_count: row.winner_vote_count as number,
      win_count: row.winner_win_count as number,
      loss_count: row.winner_loss_count as number,
      updated_at: new Date().toISOString(),
    },
    loserRating: {
      illustration_id: row.loser_illustration_id as string,
      oracle_id: payload.oracle_id,
      elo_rating: row.loser_elo as number,
      vote_count: row.loser_vote_count as number,
      win_count: row.loser_win_count as number,
      loss_count: row.loser_loss_count as number,
      updated_at: new Date().toISOString(),
    },
  };
}

/** Get all ratings for a card's illustrations, sorted by ELO desc */
export async function getRatingsForCard(oracleId: string): Promise<ArtRating[]> {
  const { data } = await getAdminClient()
    .from("art_ratings")
    .select("*")
    .eq("oracle_id", oracleId)
    .order("elo_rating", { ascending: false });
  return (data ?? []) as ArtRating[];
}

interface BestPrice {
  scryfall_id: string;
  marketplace_display_name: string;
  market_price: number | null;
  currency: string;
  product_url: string;
}

export async function getBestPricesForCard(oracleId: string): Promise<BestPrice[]> {
  const { data: printings } = await getAdminClient()
    .from("printings")
    .select("scryfall_id")
    .eq("oracle_id", oracleId);

  if (!printings || printings.length === 0) return [];

  const { data } = await getAdminClient()
    .from("best_prices")
    .select("scryfall_id, marketplace_display_name, market_price, currency, product_url")
    .in("scryfall_id", printings.map((p) => p.scryfall_id));

  return (data ?? []) as BestPrice[];
}

/** Search cards by name, limited to those with 2+ illustrations, sorted by popularity */
export async function searchCards(query: string, limit = 20): Promise<(OracleCard & { matched_flavor_name?: string | null })[]> {
  const { data, error } = await getAdminClient().rpc("search_cards_with_art", {
    p_query: query,
    p_limit: limit,
  });

  if (error) throw new Error(`Search failed: ${error.message}`);

  return (data ?? []).map((row: { oracle_id: string; name: string; slug: string; layout: string | null; type_line: string | null; mana_cost: string | null; colors: unknown; cmc: number | null; matched_flavor_name?: string | null }) => ({
    ...row,
    colors: row.colors ? JSON.stringify(row.colors) : null,
  }));
}


const PLAYABLE_SET_TYPES = ["expansion", "core", "masters", "draft_innovation", "commander"];

/** Get playable sets (expansion, core, masters, etc.), non-digital only */
export async function getPlayableSets(): Promise<MtgSet[]> {
  const { data } = await getAdminClient()
    .from("sets")
    .select("*")
    .in("set_type", PLAYABLE_SET_TYPES)
    .eq("digital", false)
    .gt("card_count", 0)
    .order("released_at", { ascending: false });
  return (data ?? []) as MtgSet[];
}

/** Get all non-digital sets (hides Arena/MTGO/Alchemy), ordered by release date desc.
 *  Used as the default for the expansions browser — broader than getPlayableSets
 *  (includes tokens, memorabilia, art series, etc.) but still excludes digital-only. */
export async function getNonDigitalSets(): Promise<MtgSet[]> {
  const { data } = await getAdminClient()
    .from("sets")
    .select("*")
    .eq("digital", false)
    .gt("card_count", 0)
    .order("released_at", { ascending: false });
  return (data ?? []) as MtgSet[];
}

/** Get all sets, ordered by release date desc */
export async function getAllSets(): Promise<MtgSet[]> {
  const { data } = await getAdminClient()
    .from("sets")
    .select("*")
    .gt("card_count", 0)
    .order("released_at", { ascending: false });
  return (data ?? []) as MtgSet[];
}

/** Get a single set by code */
export async function getSetByCode(setCode: string): Promise<MtgSet | null> {
  const { data } = await getAdminClient()
    .from("sets")
    .select("*")
    .eq("set_code", setCode)
    .single();
  return data as MtgSet | null;
}

/** Get all cards for a set */
export async function getCardsForSet(setCode: string): Promise<SetCard[]> {
  const { data } = await getAdminClient()
    .from("printings")
    .select("scryfall_id, oracle_id, collector_number, rarity, image_version, is_reprint, oracle_cards!inner(name, slug, type_line, mana_cost, layout)")
    .eq("set_code", setCode)
    .order("collector_number", { ascending: true });

  return (data ?? []).map((row) => {
    const card = row.oracle_cards as unknown as { name: string; slug: string; type_line: string | null; mana_cost: string | null; layout: string | null };
    return {
      scryfall_id: row.scryfall_id,
      oracle_id: row.oracle_id,
      name: card.name,
      slug: card.slug,
      collector_number: row.collector_number,
      rarity: row.rarity,
      type_line: card.type_line,
      mana_cost: card.mana_cost,
      image_version: row.image_version,
      layout: card.layout,
      is_reprint: row.is_reprint,
    };
  });
}

/** Get back face image URLs for all DFC printings in a set, keyed by scryfall_id */
export async function getBackFaceUrlsForSet(setCode: string): Promise<Record<string, { normal: string; art_crop?: string }>> {
  const { data: printings } = await getAdminClient()
    .from("printings")
    .select("scryfall_id, oracle_cards!inner(layout)")
    .eq("set_code", setCode)
    .in("oracle_cards.layout", ["modal_dfc", "transform", "reversible_card"]);
  if (!printings || printings.length === 0) return {};

  const { data } = await getAdminClient()
    .from("card_faces")
    .select("scryfall_id, image_uris")
    .in("scryfall_id", printings.map((p) => p.scryfall_id))
    .eq("face_index", 1);

  const map: Record<string, { normal: string; art_crop?: string }> = {};
  for (const row of data ?? []) {
    const uris = row.image_uris as { normal?: string; art_crop?: string } | null;
    if (uris?.normal) {
      map[row.scryfall_id] = { normal: uris.normal, art_crop: uris.art_crop };
    }
  }
  return map;
}

/** Look up a card by exact name (case-insensitive), with split-card fallback */
export async function lookupCardByName(name: string): Promise<OracleCard | null> {
  // Exact match
  const { data: exact } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc, og_version")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (exact) return { ...exact, colors: exact.colors ? JSON.stringify(exact.colors) : null };

  // Split card fallback: "Fire" → match "Fire // Ice"
  const { data: split } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc, og_version")
    .ilike("name", `${name} // %`)
    .limit(1)
    .maybeSingle();

  if (split) return { ...split, colors: split.colors ? JSON.stringify(split.colors) : null };

  return null;
}

/** Batch lookup cards by name — single query for exact matches, then fallback for splits */
export async function lookupCardsByNames(names: string[]): Promise<Map<string, OracleCard>> {
  const result = new Map<string, OracleCard>();
  if (names.length === 0) return result;

  // Batch exact match (case-insensitive via lower())
  const lowerNames = names.map((n) => n.toLowerCase());
  const { data: exact } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc, og_version")
    .in("name", names);

  for (const row of exact ?? []) {
    const card = { ...row, colors: row.colors ? JSON.stringify(row.colors) : null };
    result.set(row.name.toLowerCase(), card);
  }

  // Find unmatched names — try split card fallback in parallel
  const unmatched = lowerNames.filter((n) => !result.has(n));
  if (unmatched.length > 0) {
    const splitPromises = unmatched.map(async (name) => {
      const original = names.find((n) => n.toLowerCase() === name) ?? name;
      const card = await lookupCardByName(original);
      if (card) result.set(name, card);
    });
    await Promise.all(splitPromises);
  }

  return result;
}

/** Look up all cards from a decklist, returning matched cards with art and unmatched entries */
export async function lookupDeckCards(entries: DecklistEntry[]): Promise<{
  matched: DeckCardWithArt[];
  unmatched: DecklistEntry[];
}> {
  // Step 1: Batch lookup all card names at once
  const uniqueNames = [...new Set(entries.map((e) => e.name))];
  const { data: allCards } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc, og_version")
    .in("name", uniqueNames);

  const cardsByName = new Map<string, OracleCard>();
  for (const row of allCards ?? []) {
    cardsByName.set(row.name.toLowerCase(), { ...row, colors: row.colors ? JSON.stringify(row.colors) : null });
  }

  // Split card fallback for unmatched names
  const unmatchedNames = uniqueNames.filter((n) => !cardsByName.has(n.toLowerCase()));
  if (unmatchedNames.length > 0) {
    for (const name of unmatchedNames) {
      const card = await lookupCardByName(name);
      if (card) cardsByName.set(name.toLowerCase(), card);
    }
  }

  // Step 2: Deduplicate entries by oracle_id
  const matched: DeckCardWithArt[] = [];
  const unmatched: DecklistEntry[] = [];
  const seen = new Map<string, number>();
  const entryByOracleId: { entry: DecklistEntry; card: OracleCard }[] = [];

  for (const entry of entries) {
    const card = cardsByName.get(entry.name.toLowerCase());
    if (!card) { unmatched.push(entry); continue; }

    const existingIdx = seen.get(card.oracle_id);
    if (existingIdx !== undefined) {
      matched[existingIdx].quantity += entry.quantity;
      continue;
    }

    seen.set(card.oracle_id, matched.length);
    entryByOracleId.push({ entry, card });
    matched.push(null as unknown as DeckCardWithArt); // placeholder
  }

  // Step 3: Assemble results (illustrations loaded on-demand by deck page, not here)
  for (let i = 0; i < entryByOracleId.length; i++) {
    const { entry, card } = entryByOracleId[i];
    const idx = seen.get(card.oracle_id)!;
    matched[idx] = {
      card,
      quantity: entry.quantity,
      section: entry.section,
      illustrations: [],
      original_set_code: entry.original_set_code,
      original_collector_number: entry.original_collector_number,
      original_is_foil: entry.original_is_foil,
    };
  }

  return { matched, unmatched };
}

/** Search all oracle cards by name (no illustration count filter) */
export async function searchAllCards(query: string, limit = 50): Promise<OracleCard[]> {
  const { data } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc, og_version")
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(limit);

  return (data ?? []).map((row) => ({
    ...row,
    colors: row.colors ? JSON.stringify(row.colors) : null,
  }));
}

// =============================================================================
// Clash — card-level voting (comparing cards, not illustrations)
// =============================================================================

/** Get a clash pair: two random cards with representative printings and card-level ratings */
export async function getClashPair(filters?: CompareFilters): Promise<ClashPair> {
  // Pick 2 random cards via get_random_cards RPC
  const { data: cardData, error: cardError } = await getAdminClient().rpc("get_random_cards", {
    p_count: 2,
    p_min_illustrations: 1,
    ...filterParams(filters),
  });
  if (cardError) throw new Error(`Failed to get random cards: ${cardError.message}`);
  const cards = (cardData ?? []) as { oracle_id: string }[];
  if (cards.length < 2) throw new Error("Not enough cards match the selected filters");

  const { data, error } = await getAdminClient().rpc("get_clash_pair", {
    p_oracle_id_a: cards[0].oracle_id,
    p_oracle_id_b: cards[1].oracle_id,
  });

  if (error || !data || data.length < 2) {
    throw new Error(`Failed to get clash pair: ${error?.message ?? "insufficient data"}`);
  }

  const rowA = data.find((r: ClashPairRow) => r.oracle_id === cards[0].oracle_id) ?? data[0];
  const rowB = data.find((r: ClashPairRow) => r.oracle_id === cards[1].oracle_id) ?? data[1];

  return {
    a: toClashCard(rowA),
    b: toClashCard(rowB),
    a_rating: toCardRating(rowA),
    b_rating: toCardRating(rowB),
  };
}

interface ClashPairRow {
  oracle_id: string;
  name: string;
  slug: string;
  type_line: string | null;
  mana_cost: string | null;
  colors: unknown;
  cmc: number | null;
  artist: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  illustration_id: string;
  elo_rating: number | null;
  vote_count: number | null;
  win_count: number | null;
  loss_count: number | null;
  image_version: string | null;
}

function toClashCard(row: ClashPairRow): ClashCard {
  return {
    oracle_id: row.oracle_id,
    name: row.name,
    slug: row.slug,
    type_line: row.type_line,
    mana_cost: row.mana_cost,
    colors: row.colors ? JSON.stringify(row.colors) : null,
    cmc: row.cmc,
    artist: row.artist,
    set_code: row.set_code,
    set_name: row.set_name,
    collector_number: row.collector_number,
    illustration_id: row.illustration_id,
    image_version: row.image_version,
  };
}

function toCardRating(row: ClashPairRow): CardRating | null {
  if (row.elo_rating == null) return null;
  return {
    oracle_id: row.oracle_id,
    elo_rating: row.elo_rating,
    vote_count: row.vote_count ?? 0,
    win_count: row.win_count ?? 0,
    loss_count: row.loss_count ?? 0,
  };
}

/** Resolve a short printing ref (e.g. "ice-64") to illustration_id and oracle_id */
export async function resolvePrintingRef(ref: string): Promise<{ illustration_id: string; oracle_id: string } | null> {
  const dash = ref.indexOf("-");
  if (dash < 1) return null;
  const setCode = ref.slice(0, dash);
  const collectorNumber = ref.slice(dash + 1);

  const { data } = await getAdminClient()
    .from("printings")
    .select("illustration_id, oracle_id")
    .eq("set_code", setCode)
    .eq("collector_number", collectorNumber)
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

/** Get a specific ink matchup by two illustration IDs */
export async function getSpecificComparisonPair(illustrationIdA: string, illustrationIdB: string): Promise<ComparisonPair | null> {
  const admin = getAdminClient();

  // Fetch both illustrations with their ratings
  const { data } = await admin
    .from("printings")
    .select("illustration_id, oracle_id, artist, set_code, collector_number, image_version, has_image, sets!inner(name, digital)")
    .in("illustration_id", [illustrationIdA, illustrationIdB])
    .eq("has_image", true)
    .eq("sets.digital", false)
    .order("released_at", { ascending: false });

  if (!data || data.length < 2) return null;

  // Deduplicate by illustration_id (pick first/newest printing per illustration)
  const seen = new Set<string>();
  const unique = data.filter((r: { illustration_id: string }) => {
    if (seen.has(r.illustration_id)) return false;
    seen.add(r.illustration_id);
    return true;
  });
  if (unique.length < 2) return null;

  const rowA = unique.find((r: { illustration_id: string }) => r.illustration_id === illustrationIdA) ?? unique[0];
  const rowB = unique.find((r: { illustration_id: string }) => r.illustration_id === illustrationIdB) ?? unique[1];

  // Fetch the card
  const card = await getCardByOracleId(rowA.oracle_id);
  if (!card) return null;

  // Fetch ratings
  const { data: ratings } = await admin
    .from("art_ratings")
    .select("illustration_id, oracle_id, elo_rating, vote_count, win_count, loss_count")
    .in("illustration_id", [illustrationIdA, illustrationIdB]);

  const ratingMap = new Map((ratings ?? []).map((r: { illustration_id: string }) => [r.illustration_id, r]));

  const toIll = (row: typeof rowA): Illustration => ({
    illustration_id: row.illustration_id,
    oracle_id: row.oracle_id,
    artist: row.artist,
    set_code: row.set_code,
    set_name: (row.sets as unknown as { name: string }).name,
    collector_number: row.collector_number,
    released_at: "",
    image_version: row.image_version,
  });

  const toRat = (illId: string): ArtRating | null => {
    const r = ratingMap.get(illId) as { illustration_id: string; oracle_id: string; elo_rating: number; vote_count: number; win_count: number; loss_count: number } | undefined;
    if (!r) return null;
    return { illustration_id: r.illustration_id, oracle_id: r.oracle_id, elo_rating: r.elo_rating, vote_count: r.vote_count, win_count: r.win_count, loss_count: r.loss_count, updated_at: "" };
  };

  // Check if cross-card (different oracle_ids)
  const cardB = rowA.oracle_id !== rowB.oracle_id ? await getCardByOracleId(rowB.oracle_id) : undefined;

  return {
    card,
    ...(cardB ? { card_b: cardB } : {}),
    a: toIll(rowA),
    b: toIll(rowB),
    a_rating: toRat(illustrationIdA),
    b_rating: toRat(illustrationIdB),
  };
}

/** Get a specific clash matchup by two oracle IDs */
export async function getSpecificClashPair(oracleIdA: string, oracleIdB: string): Promise<ClashPair | null> {
  const { data, error } = await getAdminClient().rpc("get_clash_pair", {
    p_oracle_id_a: oracleIdA,
    p_oracle_id_b: oracleIdB,
  });

  if (error || !data || data.length < 2) return null;

  const rowA = data.find((r: ClashPairRow) => r.oracle_id === oracleIdA) ?? data[0];
  const rowB = data.find((r: ClashPairRow) => r.oracle_id === oracleIdB) ?? data[1];

  return {
    a: toClashCard(rowA),
    b: toClashCard(rowB),
    a_rating: toCardRating(rowA),
    b_rating: toCardRating(rowB),
  };
}

/** Record a card-level vote and return updated ratings */
export async function recordCardVote(payload: CardVotePayload, kFactor?: number) {
  const { data, error } = await getAdminClient().rpc("record_card_vote", {
    p_winner_oracle_id: payload.winner_oracle_id,
    p_loser_oracle_id: payload.loser_oracle_id,
    p_session_id: payload.session_id,
    p_user_id: payload.user_id ?? null,
    p_vote_source: payload.vote_source ?? null,
    p_k_factor: kFactor ?? null,
  });

  if (error) throw new Error(`Vote failed: ${error.message}`);
  const row = data[0];

  return {
    winner_rating: {
      oracle_id: row.winner_oracle_id as string,
      elo_rating: row.winner_elo as number,
      vote_count: row.winner_vote_count as number,
      win_count: row.winner_win_count as number,
      loss_count: row.winner_loss_count as number,
    },
    loser_rating: {
      oracle_id: row.loser_oracle_id as string,
      elo_rating: row.loser_elo as number,
      vote_count: row.loser_vote_count as number,
      win_count: row.loser_win_count as number,
      loss_count: row.loser_loss_count as number,
    },
  };
}

// =============================================================================
// Artists
// =============================================================================

/** Get all artists, sorted by illustration count or popularity */
export async function getAllArtists(
  sort: "illustrations" | "popular" | "trending" = "illustrations",
  period: "week" | "month" | "all" = "all",
  limit = 100,
  offset = 0
): Promise<{ artists: (Artist & { total_votes?: number; avg_elo?: number | null })[]; total: number }> {
  if (sort === "trending") {
    const { data, count, error } = await getAdminClient()
      .from("artist_stats")
      .select("artist_id, total_votes, artists!inner(id, name, slug, illustration_count, hero_set_code, hero_collector_number, hero_image_version)", { count: "exact" })
      .eq("period", period)
      .gt("total_votes", 0)
      .order("total_votes", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to get artists: ${error.message}`);

    const artists = (data ?? []).map((row: Record<string, unknown>) => {
      const a = row.artists as Record<string, unknown>;
      return {
        id: a.id as number,
        name: a.name as string,
        slug: a.slug as string,
        illustration_count: a.illustration_count as number,
        hero_set_code: a.hero_set_code as string | null,
        hero_collector_number: a.hero_collector_number as string | null,
        hero_image_version: a.hero_image_version as string | null,
        total_votes: row.total_votes as number,
      };
    });
    return { artists, total: count ?? 0 };
  }

  if (sort === "popular") {
    // Popular = highest avg ELO, requires minimum votes to filter noise
    const { data, count, error } = await getAdminClient()
      .from("artist_stats")
      .select("artist_id, total_votes, avg_elo, artists!inner(id, name, slug, illustration_count, hero_set_code, hero_collector_number, hero_image_version)", { count: "exact" })
      .eq("period", "all")
      .gt("total_votes", 9)
      .not("avg_elo", "is", null)
      .order("avg_elo", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to get artists: ${error.message}`);

    const artists = (data ?? []).map((row: Record<string, unknown>) => {
      const a = row.artists as Record<string, unknown>;
      return {
        id: a.id as number,
        name: a.name as string,
        slug: a.slug as string,
        illustration_count: a.illustration_count as number,
        hero_set_code: a.hero_set_code as string | null,
        hero_collector_number: a.hero_collector_number as string | null,
        hero_image_version: a.hero_image_version as string | null,
        total_votes: row.total_votes as number,
        avg_elo: row.avg_elo as number | null,
      };
    });
    return { artists, total: count ?? 0 };
  }

  const { data, count, error } = await getAdminClient()
    .from("artists")
    .select("*", { count: "exact" })
    .order("illustration_count", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to get artists: ${error.message}`);
  return { artists: (data ?? []) as Artist[], total: count ?? 0 };
}

/** Get an artist by slug */
export async function getArtistBySlug(slug: string): Promise<Artist | null> {
  const { data } = await getAdminClient()
    .from("artists")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data as Artist | null;
}

/** Get all illustrations by an artist with ratings */
export async function getArtistIllustrations(artistName: string): Promise<ArtistIllustration[]> {
  const { data, error } = await getAdminClient().rpc("get_artist_illustrations", {
    p_artist_name: artistName,
  });
  if (error) throw new Error(`Failed to get artist illustrations: ${error.message}`);
  return (data ?? []) as ArtistIllustration[];
}

/** Get pre-computed stats for an artist */
export async function getArtistStats(artistId: number): Promise<ArtistStats[]> {
  const { data } = await getAdminClient()
    .from("artist_stats")
    .select("*")
    .eq("artist_id", artistId);
  return (data ?? []) as ArtistStats[];
}

/** Search artists by name */
export async function searchArtists(query: string, limit = 20): Promise<Artist[]> {
  const { data, error } = await getAdminClient()
    .from("artists")
    .select("*")
    .ilike("name", `%${query}%`)
    .order("illustration_count", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Artist search failed: ${error.message}`);
  return (data ?? []) as Artist[];
}

// --- Tribes (creature subtypes) ---

export async function getCreatureTribes(): Promise<Tribe[]> {
  const { data, error } = await getAdminClient().rpc("get_creature_tribes");
  if (error) throw new Error(`Failed to load tribes: ${error.message}`);
  return (data ?? []) as Tribe[];
}

export interface TopCard {
  oracle_id: string;
  name: string;
  slug: string;
  type_line: string | null;
  mana_cost: string | null;
  illustration_count: number;
  total_votes: number;
  set_code: string;
  collector_number: string;
  image_version: string | null;
}

export async function getTopCards(
  sort: "popular" | "prints" = "popular",
  limit = 50,
  offset = 0,
): Promise<{ cards: TopCard[]; total: number }> {
  const admin = getAdminClient();

  const { data, error } = await admin.rpc("get_top_cards", {
    p_sort: sort === "prints" ? "prints" : "popular",
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw new Error(`Failed to get top cards: ${error.message}`);

  // Get total count
  const { count } = await admin
    .from("oracle_cards")
    .select("*", { count: "exact", head: true })
    .gt("illustration_count", 1);

  return { cards: (data ?? []) as TopCard[], total: count ?? 0 };
}

export async function getCardsByTribe(
  tribe: string,
  page = 1,
  pageSize = 60,
  sort: "name" | "popular" | "price" = "popular"
): Promise<{ cards: BrowseCard[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [{ data, error }, { data: countData }] = await Promise.all([
    getAdminClient().rpc("get_cards_by_tribe", {
      p_slug: tribe, p_limit: pageSize, p_offset: offset, p_sort: sort,
    }),
    getAdminClient().rpc("count_cards_by_tribe", { p_slug: tribe }),
  ]);
  if (error) throw new Error(`Failed to load tribe cards: ${error.message}`);
  return { cards: (data ?? []) as BrowseCard[], total: countData ?? 0 };
}

// --- Tags (Scryfall Tagger + Ink mechanical tags) ---

const TAG_COLUMNS = "tag_id, label, slug, type, description, usage_count, source, rule_definition, category";

/** Get all tags for a card (oracle tags + illustration tags) */
export async function getTagsForCard(oracleId: string): Promise<Tag[]> {
  const admin = getAdminClient();

  // Get oracle tags
  const { data: oracleTags } = await admin
    .from("oracle_tags")
    .select(`tag_id, tags!inner(${TAG_COLUMNS})`)
    .eq("oracle_id", oracleId);

  // Get illustration_ids for this card, then their tags
  const { data: printingRows } = await admin
    .from("printings")
    .select("illustration_id")
    .eq("oracle_id", oracleId)
    .not("illustration_id", "is", null);

  const illIds = [...new Set((printingRows ?? []).map((r) => r.illustration_id))];

  let illTags: typeof oracleTags = [];
  if (illIds.length > 0) {
    const { data } = await admin
      .from("illustration_tags")
      .select(`tag_id, tags!inner(${TAG_COLUMNS})`)
      .in("illustration_id", illIds);
    illTags = data ?? [];
  }

  // Dedupe by tag_id
  const seen = new Set<string>();
  const tags: Tag[] = [];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  for (const row of [...(oracleTags ?? []), ...illTags]) {
    const t = (row as any).tags as Tag;
    if (t && !seen.has(t.tag_id)) {
      seen.add(t.tag_id);
      tags.push(t);
    }
  }

  return tags.sort((a, b) => a.label.localeCompare(b.label));
}

export async function getTags(
  search?: string,
  type?: string,
  page = 1,
  pageSize = 50,
  source?: string
): Promise<{ tags: Tag[]; total: number }> {
  const offset = (page - 1) * pageSize;
  let query = getAdminClient()
    .from("tags")
    .select(TAG_COLUMNS, { count: "exact" })
    .order("usage_count", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (search) {
    query = query.ilike("label", `%${search}%`);
  }
  if (type) {
    query = query.eq("type", type);
  }
  if (source) {
    query = query.eq("source", source);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to load tags: ${error.message}`);
  return { tags: (data ?? []) as Tag[], total: count ?? 0 };
}

export async function getAllTagsByType(
  type: "oracle" | "illustration",
  source = "scryfall"
): Promise<Tag[]> {
  let query = getAdminClient()
    .from("tags")
    .select(TAG_COLUMNS)
    .order("usage_count", { ascending: false })
    .eq("type", type);
  if (source) query = query.eq("source", source);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load tags: ${error.message}`);
  return (data ?? []) as Tag[];
}

export async function getTopCardsBoth(limit = 500): Promise<{
  popular: TopCard[];
  prints: TopCard[];
  total: number;
}> {
  const admin = getAdminClient();
  const [popularRes, printsRes, countRes] = await Promise.all([
    admin.rpc("get_top_cards", { p_sort: "popular", p_limit: limit, p_offset: 0 }),
    admin.rpc("get_top_cards", { p_sort: "prints", p_limit: limit, p_offset: 0 }),
    admin.from("oracle_cards").select("*", { count: "exact", head: true }).gt("illustration_count", 1),
  ]);
  if (popularRes.error) throw new Error(`Failed to get top cards: ${popularRes.error.message}`);
  if (printsRes.error) throw new Error(`Failed to get top cards: ${printsRes.error.message}`);
  return {
    popular: (popularRes.data ?? []) as TopCard[],
    prints: (printsRes.data ?? []) as TopCard[],
    total: countRes.count ?? 0,
  };
}

export async function getTagById(tagId: string): Promise<Tag | null> {
  const { data } = await getAdminClient()
    .from("tags")
    .select(TAG_COLUMNS)
    .eq("tag_id", tagId)
    .single();
  return data as Tag | null;
}

export async function getTagBySlug(slug: string): Promise<Tag | null> {
  const { data } = await getAdminClient()
    .from("tags")
    .select(TAG_COLUMNS)
    .eq("slug", slug)
    .single();
  return data as Tag | null;
}

export async function getCardsByTag(
  tagId: string,
  page = 1,
  pageSize = 60,
  tagType?: string
): Promise<{ cards: BrowseCard[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [{ data, error }, { data: countData }] = await Promise.all([
    getAdminClient().rpc("get_cards_by_tag", {
      p_tag_id: tagId, p_limit: pageSize, p_offset: offset, p_tag_type: tagType ?? null,
    }),
    getAdminClient().rpc("count_cards_by_tag", { p_tag_id: tagId, p_tag_type: tagType ?? null }),
  ]);
  if (error) throw new Error(`Failed to load tag cards: ${error.message}`);
  return { cards: (data ?? []) as BrowseCard[], total: countData ?? 0 };
}

// =============================================================================
// Gauntlet — king of the hill pools
// =============================================================================

/** Get all illustrations for a card as gauntlet entries (remix mode) */
export async function getGauntletIllustrations(oracleId: string): Promise<GauntletEntry[]> {
  const [card, illustrations] = await Promise.all([
    getCardByOracleId(oracleId),
    getIllustrationsForCard(oracleId),
  ]);

  if (!card || illustrations.length === 0) return [];

  return illustrations.map((ill) => ({
    name: card.name,
    slug: card.slug,
    oracle_id: card.oracle_id,
    illustration_id: ill.illustration_id,
    artist: ill.artist,
    set_code: ill.set_code,
    set_name: ill.set_name,
    collector_number: ill.collector_number,
    image_version: ill.image_version,
    type_line: card.type_line,
    mana_cost: card.mana_cost,
  }));
}

/** Pick a random card with 5+ illustrations for a remix gauntlet */
export async function getRandomGauntletCard(): Promise<OracleCard | null> {
  const cards = await getRandomCards(1, 5);
  return cards[0] ?? null;
}

/** Pick a random creature tribe with 10+ cards for a group gauntlet */
export async function getRandomGauntletGroup(): Promise<{ subtype: string; label: string } | null> {
  const { data } = await getAdminClient().rpc("get_creature_tribes");
  if (!data) return null;
  const eligible = (data as { tribe: string; slug: string; card_count: number }[]).filter(
    (t) => t.card_count >= 10,
  );
  if (eligible.length === 0) return null;
  const pick = eligible[Math.floor(Math.random() * eligible.length)];
  return { subtype: pick.tribe, label: pick.tribe };
}

// =============================================================================
// Daily Challenges
// =============================================================================

/** Get today's daily challenges with participation status */
export async function getDailyChallenges(sessionId: string): Promise<DailyChallengeWithStatus[]> {
  const today = new Date().toISOString().split("T")[0];
  const admin = getAdminClient();

  // Fast path: just SELECT existing challenges (avoids expensive stored proc)
  let { data: challenges } = await admin
    .from("daily_challenges")
    .select("*")
    .eq("challenge_date", today);

  // Call the stored proc if fewer than expected challenges exist (e.g.
  // bracket was added after gauntlet was already generated for today).
  // The proc is idempotent — ON CONFLICT DO NOTHING for existing types.
  if (!challenges || challenges.length < 2) {
    const { data, error } = await admin.rpc("generate_daily_challenges", {
      p_date: today,
    });
    if (error) throw new Error(`Failed to get daily challenges: ${error.message}`);
    challenges = data;
  }

  if (!challenges || challenges.length === 0) return [];

  const challengeIds = (challenges as DailyChallenge[]).map((c) => c.id);

  // Get stats and participation status in parallel
  const [{ data: statsData }, { data: participationData }] = await Promise.all([
    getAdminClient()
      .from("daily_challenge_stats")
      .select("*")
      .in("challenge_id", challengeIds),
    getAdminClient()
      .from("daily_participations")
      .select("challenge_id")
      .in("challenge_id", challengeIds)
      .eq("session_id", sessionId),
  ]);

  const statsMap = new Map(
    (statsData ?? []).map((s: DailyChallengeStats & { challenge_id: number }) => [s.challenge_id, s]),
  );
  const participatedSet = new Set(
    (participationData ?? []).map((p: { challenge_id: number }) => p.challenge_id),
  );

  return (challenges as DailyChallenge[]).map((c) => ({
    ...c,
    stats: statsMap.get(c.id) ?? {
      participation_count: 0,
      illustration_votes: null,
      side_a_votes: 0,
      side_b_votes: 0,
      champion_counts: null,
      avg_champion_wins: null,
      max_champion_wins: 0,
      bracket_matchups: null,
    },
    participated: participatedSet.has(c.id),
  }));
}

/** Get a single daily challenge by type for today */
export async function getDailyChallenge(type: string): Promise<DailyChallenge | null> {
  const today = new Date().toISOString().split("T")[0];
  const admin = getAdminClient();

  // Fast path: try direct SELECT first
  const { data } = await admin
    .from("daily_challenges")
    .select("*")
    .eq("challenge_date", today)
    .eq("challenge_type", type)
    .maybeSingle();

  if (data) return data as DailyChallenge;

  // Generate if missing — use RPC results directly (avoids read-replica lag)
  const { data: rpcData, error } = await admin.rpc("generate_daily_challenges", { p_date: today });

  if (error) {
    console.error("Failed to generate daily challenges:", error);
    return null;
  }

  // RPC returns all challenge types for the date — find the one we need
  const match = (rpcData as DailyChallenge[])?.find(c => c.challenge_type === type);
  return match ?? null;
}

/** Get a daily challenge by date and type (no generation for past dates) */
export async function getDailyChallengeByDate(type: string, date: string): Promise<DailyChallenge | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("daily_challenges")
    .select("*")
    .eq("challenge_date", date)
    .eq("challenge_type", type)
    .maybeSingle();

  if (data) return data as DailyChallenge;

  // Only generate for today
  const today = new Date().toISOString().split("T")[0];
  if (date === today) {
    await admin.rpc("generate_daily_challenges", { p_date: today });
    const { data: generated } = await admin
      .from("daily_challenges")
      .select("*")
      .eq("challenge_date", today)
      .eq("challenge_type", type)
      .maybeSingle();
    return generated as DailyChallenge | null;
  }

  return null;
}

/** Record daily participation and return updated stats */
export async function recordDailyParticipation(
  challengeId: number,
  sessionId: string,
  userId: string | null,
  result: Record<string, unknown>,
): Promise<DailyChallengeStats> {
  const { data, error } = await getAdminClient().rpc("record_daily_participation", {
    p_challenge_id: challengeId,
    p_session_id: sessionId,
    p_user_id: userId,
    p_result: result,
  });

  if (error) throw new Error(`Failed to record participation: ${error.message}`);
  const row = (data as Record<string, unknown>[])[0];
  return {
    participation_count: row.participation_count as number,
    illustration_votes: row.illustration_votes as Record<string, number> | null,
    side_a_votes: row.side_a_votes as number,
    side_b_votes: row.side_b_votes as number,
    champion_counts: row.champion_counts as Record<string, number> | null,
    avg_champion_wins: row.avg_champion_wins as number | null,
    max_champion_wins: row.max_champion_wins as number,
    bracket_matchups: null, // RPC doesn't return this column; read from stats table if needed
  };
}

/** Get individual gauntlet results for a daily challenge (for streaks/losers) */
export async function getDailyGauntletResults(challengeId: number) {
  const { data } = await getAdminClient()
    .from("gauntlet_results")
    .select("champion_name, champion_wins, champion_oracle_id, champion_illustration_id, results")
    .eq("daily_challenge_id", challengeId)
    .order("champion_wins", { ascending: false })
    .limit(100);
  return data ?? [];
}

/** Check if a session has participated in a challenge */
export async function hasParticipated(challengeId: number, sessionId: string): Promise<boolean> {
  const { data } = await getAdminClient()
    .from("daily_participations")
    .select("id")
    .eq("challenge_id", challengeId)
    .eq("session_id", sessionId)
    .maybeSingle();
  return !!data;
}

/** Get stats for a challenge */
export async function getDailyChallengeStats(challengeId: number): Promise<DailyChallengeStats | null> {
  const { data } = await getAdminClient()
    .from("daily_challenge_stats")
    .select("*")
    .eq("challenge_id", challengeId)
    .maybeSingle();
  return data as DailyChallengeStats | null;
}

// =============================================================================
// Gauntlet Themes
// =============================================================================

/** Pick a random theme with balanced type selection (pick type first, then theme) */
function pickBalancedTheme(themes: GauntletTheme[]): GauntletTheme | null {
  // Exclude card_remix from random selection (still available via brew/direct link)
  // Enforce minimum pool size of 10
  const eligible = themes.filter(
    (t) => t.theme_type !== "card_remix" && (!t.pool_size_estimate || t.pool_size_estimate >= 10)
  );
  if (eligible.length === 0) return null;
  // Get distinct types
  const types = [...new Set(eligible.map((t) => t.theme_type))];
  // Pick a random type
  const type = types[Math.floor(Math.random() * types.length)];
  // Pick a random theme within that type
  const ofType = eligible.filter((t) => t.theme_type === type);
  return ofType[Math.floor(Math.random() * ofType.length)];
}

/** Get a random active theme */
export async function getRandomTheme(allowedTypes?: string[]): Promise<GauntletTheme | null> {
  let query = getAdminClient()
    .from("gauntlet_themes")
    .select("*")
    .eq("is_active", true);

  if (allowedTypes?.length) {
    query = query.in("theme_type", allowedTypes);
  }

  const { data } = await query;
  return pickBalancedTheme((data as GauntletTheme[]) ?? []);
}

/** Get a random VS theme for the regular VS page */
export async function getRandomVsTheme(allowedTypes?: string[]): Promise<GauntletTheme | null> {
  const types = allowedTypes ?? ["tribe", "set", "artist", "tag", "art_tag"];
  const { data } = await getAdminClient()
    .from("gauntlet_themes")
    .select("*")
    .eq("is_active", true)
    .eq("pool_mode", "vs")
    .in("theme_type", types);

  return pickBalancedTheme((data as GauntletTheme[]) ?? []);
}

/** Get two random oracle_ids that share an oracle tag */
export async function getRandomCardsByTag(tagId: string): Promise<string[]> {
  const { data } = await getAdminClient()
    .from("oracle_tags")
    .select("oracle_id")
    .eq("tag_id", tagId)
    .limit(200);

  if (!data || data.length < 2) return [];
  const ids = data.map((r: { oracle_id: string }) => r.oracle_id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, 2);
}

/** Get two random oracle_ids that share an illustration (art) tag */
export async function getRandomCardsByArtTag(tagId: string): Promise<string[]> {
  const { data } = await getAdminClient()
    .rpc("get_oracle_ids_by_art_tag", { p_tag_id: tagId });

  if (!data || data.length < 2) return [];
  const ids = data.map((r: { oracle_id: string }) => r.oracle_id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, 2);
}

/** Get two random oracle_ids by a specific artist */
/** Get two random illustration_ids by an artist (for remix mode) */
export async function getRandomIllustrationsByArtist(artist: string): Promise<string[]> {
  const { data } = await getAdminClient()
    .from("printings")
    .select("illustration_id")
    .eq("artist", artist)
    .not("illustration_id", "is", null)
    .limit(500);

  if (!data || data.length < 2) return [];
  const unique = [...new Set(data.map((r: { illustration_id: string }) => r.illustration_id))];
  if (unique.length < 2) return [];
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, 2);
}

/** Get two random oracle_ids by an artist (for VS mode) */
export async function getRandomCardsByArtist(artist: string): Promise<string[]> {
  const { data } = await getAdminClient()
    .from("printings")
    .select("oracle_id")
    .eq("artist", artist)
    .limit(200);

  if (!data || data.length < 2) return [];
  const unique = [...new Set(data.map((r: { oracle_id: string }) => r.oracle_id))];
  if (unique.length < 2) return [];
  // Shuffle and pick 2
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, 2);
}

/** Get a specific theme by ID */
export async function getTheme(id: number): Promise<GauntletTheme | null> {
  const { data } = await getAdminClient()
    .from("gauntlet_themes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as GauntletTheme | null;
}

// =============================================================================
// Gauntlet Pool Queries
// =============================================================================

/** Get random cards with representative printings as gauntlet entries (VS mode) */
export async function getGauntletCards(
  count: number,
  filters?: CompareFilters,
  excludeOracleIds?: string[],
): Promise<GauntletEntry[]> {
  const fetchCount = excludeOracleIds?.length ? count * 3 : count;
  const cards = await getRandomCards(fetchCount, 1, filters);

  let filtered = cards;
  if (excludeOracleIds?.length) {
    const excludeSet = new Set(excludeOracleIds);
    filtered = cards.filter((c) => !excludeSet.has(c.oracle_id));
  }
  filtered = filtered.slice(0, count);
  if (filtered.length === 0) return [];

  // Batch fetch one representative printing per card (newest non-digital first)
  const oracleIds = filtered.map((c) => c.oracle_id);
  const { data: printings } = await getAdminClient()
    .from("printings")
    .select("oracle_id, illustration_id, artist, set_code, collector_number, image_version, sets!inner(name, digital)")
    .in("oracle_id", oracleIds)
    .not("illustration_id", "is", null)
    .eq("sets.digital", false)
    .order("released_at", { ascending: false });

  // Deduplicate — one printing per oracle_id (newest first)
  const printingMap = new Map<string, (typeof printings extends (infer T)[] | null ? T : never)>();
  for (const p of printings ?? []) {
    if (!printingMap.has(p.oracle_id)) {
      printingMap.set(p.oracle_id, p);
    }
  }

  return filtered
    .map((card) => {
      const printing = printingMap.get(card.oracle_id);
      if (!printing) return null;
      return {
        name: card.name,
        slug: card.slug,
        oracle_id: card.oracle_id,
        illustration_id: printing.illustration_id,
        artist: printing.artist,
        set_code: printing.set_code,
        set_name: (printing.sets as unknown as { name: string }).name,
        collector_number: printing.collector_number,
        image_version: printing.image_version,
        type_line: card.type_line,
        mana_cost: card.mana_cost,
      };
    })
    .filter((e): e is GauntletEntry => e !== null);
}

/** Get illustrations by a specific artist as gauntlet entries */
export async function getGauntletIllustrationsByArtist(artistName: string, count = 20): Promise<GauntletEntry[]> {
  const { data } = await getAdminClient()
    .from("printings")
    .select("oracle_id, illustration_id, artist, set_code, collector_number, image_version, released_at, sets!inner(name, digital), oracle_cards!inner(name, slug, type_line, mana_cost)")
    .eq("artist", artistName)
    .not("illustration_id", "is", null)
    .eq("sets.digital", false)
    .order("released_at", { ascending: false });

  if (!data || data.length === 0) return [];

  // Deduplicate by illustration_id (one per unique illustration)
  const seen = new Set<string>();
  const entries: GauntletEntry[] = [];
  for (const p of data) {
    if (seen.has(p.illustration_id)) continue;
    seen.add(p.illustration_id);
    const card = p.oracle_cards as unknown as { name: string; slug: string; type_line: string | null; mana_cost: string | null };
    entries.push({
      name: card.name,
      slug: card.slug,
      oracle_id: p.oracle_id,
      illustration_id: p.illustration_id,
      artist: p.artist,
      set_code: p.set_code,
      set_name: (p.sets as unknown as { name: string }).name,
      collector_number: p.collector_number,
      image_version: p.image_version,
      type_line: card.type_line,
      mana_cost: card.mana_cost,
    });
    if (entries.length >= count) break;
  }
  return entries;
}

/** Get all unique illustrations in a set as gauntlet entries */
export async function getGauntletIllustrationsBySet(
  setCode: string,
  count = 20,
  filters?: {
    colors?: string[];
    type?: string;
    subtype?: string;
    rulesText?: string;
    rarity?: string;
    includeChildren?: boolean;
    onlyNewCards?: boolean;
    firstIllustrationOnly?: boolean;
    lastIllustrationOnly?: boolean;
  },
): Promise<GauntletEntry[]> {
  const admin = getAdminClient();

  // If includeChildren, resolve child set codes first so we can filter by them
  let setCodes: string[] = [setCode];
  if (filters?.includeChildren) {
    const { data: children } = await admin
      .from("sets")
      .select("set_code")
      .eq("parent_set_code", setCode);
    if (children) {
      setCodes = [setCode, ...children.map((c) => c.set_code)];
    }
  }

  let query = admin
    .from("printings")
    .select("oracle_id, illustration_id, artist, set_code, collector_number, image_version, released_at, rarity, is_reprint, sets!inner(name, digital), oracle_cards!inner(name, slug, type_line, mana_cost, colors, oracle_text)")
    .in("set_code", setCodes)
    .not("illustration_id", "is", null)
    .eq("sets.digital", false);

  if (filters?.onlyNewCards) {
    query = query.eq("is_reprint", false);
  }
  if (filters?.type) {
    query = query.ilike("oracle_cards.type_line", `%${filters.type}%`);
  }
  if (filters?.subtype) {
    query = query.ilike("oracle_cards.type_line", `%${filters.subtype}%`);
  }
  if (filters?.rulesText) {
    query = query.ilike("oracle_cards.oracle_text", `%${filters.rulesText}%`);
  }
  // Split out pseudo-colors (M=multicolor, C=colorless) from real WUBRG colors.
  const realColors = filters?.colors?.filter((c) => "WUBRG".includes(c)) ?? [];
  const wantMulti = filters?.colors?.includes("M") ?? false;
  const wantColorless = filters?.colors?.includes("C") ?? false;

  // Apply real color filter at the DB level (contains check on oracle_cards.colors)
  if (realColors.length > 0) {
    query = query.filter("oracle_cards.colors", "cs", JSON.stringify(realColors));
  }
  if (filters?.rarity) {
    query = query.eq("rarity", filters.rarity.toLowerCase());
  }

  const { data } = await query.order("released_at", { ascending: false });

  if (!data || data.length === 0) return [];

  // Post-fetch: apply multi-color / colorless / mono-only filtering.
  // The DB "cs" filter returns cards that CONTAIN the selected colors,
  // which includes multi-color cards. If the user didn't select "M",
  // we need to exclude multi-color cards (keep mono only).
  const colorFiltered = realColors.length > 0 || wantColorless
    ? data.filter((p) => {
        const card = p.oracle_cards as unknown as { colors: string[] | null };
        const cardColors = card.colors ?? [];

        // Colorless cards: include only if C is selected
        if (cardColors.length === 0) return wantColorless;

        // Multi-color cards: include only if M is selected
        if (cardColors.length > 1) return wantMulti;

        // Mono-color cards: include if their single color is in realColors
        // (the DB query already filtered for "contains", but this catches edge cases)
        if (realColors.length > 0) return realColors.includes(cardColors[0]);

        return true;
      })
    : data;

  if (colorFiltered.length === 0) return [];

  // Parse collector number for sorting (e.g., "4" → 4, "4a" → 4, "★1" → 1)
  const collectorNum = (cn: string): number => {
    const m = cn.match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
  };

  // Sort by collector number. lastIllustrationOnly flips to DESC so the
  // highest collector # (showcase/borderless/alt) is seen first during
  // dedup — this controls which PRINTING represents each illustration_id
  // even when all illustrations are included.
  const desc = !!filters?.lastIllustrationOnly;
  const sorted = [...colorFiltered].sort((a, b) =>
    desc
      ? collectorNum(b.collector_number) - collectorNum(a.collector_number)
      : collectorNum(a.collector_number) - collectorNum(b.collector_number),
  );

  // firstIllustrationOnly = one illustration per oracle_id (one-per-card).
  // When false, all distinct illustration_ids are kept.
  const onePerCard = !!filters?.firstIllustrationOnly;
  const seenIllustrations = new Set<string>();
  const seenOracles = new Set<string>();
  const all: GauntletEntry[] = [];
  for (const p of sorted) {
    if (seenIllustrations.has(p.illustration_id)) continue;
    if (onePerCard && seenOracles.has(p.oracle_id)) continue;
    seenIllustrations.add(p.illustration_id);
    seenOracles.add(p.oracle_id);
    const card = p.oracle_cards as unknown as { name: string; slug: string; type_line: string | null; mana_cost: string | null };
    all.push({
      name: card.name,
      slug: card.slug,
      oracle_id: p.oracle_id,
      illustration_id: p.illustration_id,
      artist: p.artist,
      set_code: p.set_code,
      set_name: (p.sets as unknown as { name: string }).name,
      collector_number: p.collector_number,
      image_version: p.image_version,
      type_line: card.type_line,
      mana_cost: card.mana_cost,
    });
  }

  // Shuffle and trim
  return all.sort(() => Math.random() - 0.5).slice(0, count);
}

/** Get cards by tag as gauntlet entries */
/** Run `.in(column, ids)` in chunks to stay under the PostgREST URL
 *  size limit. Each UUID is ~37 chars with the comma, and the default
 *  header limit is around 8KB — 150 UUIDs per chunk keeps us well
 *  inside that. */
const IN_CHUNK_SIZE = 150;
async function inChunked<T>(
  ids: string[],
  fetcher: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE);
    out.push(...(await fetcher(chunk)));
  }
  return out;
}

export async function getGauntletCardsByTag(tagId: string, count = 10): Promise<GauntletEntry[]> {
  // Get oracle_ids for this tag (could be illustration_tags or oracle_tags)
  const { data: tagData } = await getAdminClient()
    .from("tags")
    .select("type")
    .eq("tag_id", tagId)
    .maybeSingle();

  const isIllustrationTag = tagData?.type === "illustration";

  let oracleIds: string[];
  if (isIllustrationTag) {
    // Two-step: get illustration_ids from tag, then find oracle_ids via printings
    const { data: itRows } = await getAdminClient()
      .from("illustration_tags")
      .select("illustration_id")
      .eq("tag_id", tagId)
      .limit(count * 10);
    let illIds = [...new Set((itRows ?? []).map((r) => r.illustration_id))];
    if (illIds.length === 0) return [];
    // Shuffle first so a trimmed chunk set is still randomized.
    illIds = illIds.sort(() => Math.random() - 0.5).slice(0, Math.max(count * 3, 100));
    const pRows = await inChunked(illIds, async (chunk) => {
      const { data } = await getAdminClient()
        .from("printings")
        .select("oracle_id")
        .in("illustration_id", chunk)
        .not("oracle_id", "is", null);
      return data ?? [];
    });
    const ids = new Set(pRows.map((r) => r.oracle_id));
    oracleIds = [...ids];
  } else {
    const { data } = await getAdminClient()
      .from("oracle_tags")
      .select("oracle_id")
      .eq("tag_id", tagId)
      .limit(count * 5);
    oracleIds = (data ?? []).map((d) => d.oracle_id);
  }

  if (oracleIds.length === 0) return [];

  // Shuffle and take extra to account for filtering (excluded layouts, digital-only sets)
  const shuffled = oracleIds.sort(() => Math.random() - 0.5).slice(0, Math.max(count * 2, 100));

  // Get card data + representative printing (exclude non-standard layouts).
  // Chunked to keep the URL within PostgREST's size limit — a 460-card
  // counterspell bracket was hitting ~17KB URLs before and silently
  // returning empty, so the bracket save claimed "pool too small".
  const cards = await inChunked(shuffled, async (chunk) => {
    const { data } = await getAdminClient()
      .from("oracle_cards")
      .select("oracle_id, name, slug, layout, type_line, mana_cost")
      .in("oracle_id", chunk);
    return data ?? [];
  });

  if (cards.length === 0) return [];
  const filteredCards = cards.filter((c) => !EXCLUDED_LAYOUTS.has(c.layout ?? ""));
  if (filteredCards.length === 0) return [];
  const filteredIds = filteredCards.map((c) => c.oracle_id);

  const printings = await inChunked(filteredIds, async (chunk) => {
    const { data } = await getAdminClient()
      .from("printings")
      .select("oracle_id, illustration_id, artist, set_code, collector_number, image_version, sets!inner(name, digital)")
      .in("oracle_id", chunk)
      .not("illustration_id", "is", null)
      .eq("sets.digital", false)
      .order("released_at", { ascending: false });
    return data ?? [];
  });

  type PrintingRow = (typeof printings)[number];
  const printingMap = new Map<string, PrintingRow>();
  for (const p of printings) {
    if (!printingMap.has(p.oracle_id)) {
      printingMap.set(p.oracle_id, p);
    }
  }

  return filteredCards
    .map((card) => {
      const printing = printingMap.get(card.oracle_id);
      if (!printing) return null;
      return {
        name: card.name,
        slug: card.slug,
        oracle_id: card.oracle_id,
        illustration_id: printing.illustration_id,
        artist: printing.artist,
        set_code: printing.set_code,
        set_name: (printing.sets as unknown as { name: string }).name,
        collector_number: printing.collector_number,
        image_version: printing.image_version,
        type_line: card.type_line,
        mana_cost: card.mana_cost,
      };
    })
    .filter((e): e is GauntletEntry => e !== null)
    .slice(0, count);
}

// =============================================================================
// Brew — live count for custom game builder
// =============================================================================

export async function getBrewCount(
  source: string,
  sourceId: string,
  colors?: string[],
  type?: string,
  subtype?: string,
  rulesText?: string,
  rarity?: string,
  includeChildren?: boolean,
  onlyNewCards?: boolean,
  firstIllustrationOnly?: boolean,
): Promise<number> {
  const admin = getAdminClient();

  if (source === "card") {
    // Count distinct illustrations for this card
    const { data } = await admin
      .from("printings")
      .select("illustration_id")
      .eq("oracle_id", sourceId)
      .not("illustration_id", "is", null);
    const unique = new Set((data ?? []).map((d) => d.illustration_id));
    return unique.size;
  }

  if (source === "artist") {
    // Count distinct illustrations by this artist
    const { data } = await admin
      .from("printings")
      .select("illustration_id, sets!inner(digital)")
      .eq("artist", sourceId)
      .not("illustration_id", "is", null)
      .eq("sets.digital", false);
    const unique = new Set((data ?? []).map((d) => d.illustration_id));
    return unique.size;
  }

  if (source === "expansion") {
    // Resolve target set codes — optionally include children
    let setCodes = [sourceId];
    if (includeChildren) {
      const { data: children } = await admin
        .from("sets")
        .select("set_code")
        .eq("parent_set_code", sourceId);
      if (children) setCodes = [sourceId, ...children.map((c) => c.set_code)];
    }

    // Count distinct illustrations in the target sets, with optional filters
    let query = admin
      .from("printings")
      .select("oracle_id, illustration_id, oracle_cards!inner(type_line, colors, oracle_text)")
      .in("set_code", setCodes)
      .not("illustration_id", "is", null);

    if (onlyNewCards) {
      query = query.eq("is_reprint", false);
    }
    if (type) {
      query = query.ilike("oracle_cards.type_line", `%${type}%`);
    }
    if (subtype) {
      query = query.ilike("oracle_cards.type_line", `%${subtype}%`);
    }
    if (rulesText) {
      query = query.ilike("oracle_cards.oracle_text", `%${rulesText}%`);
    }
    // Split pseudo-colors (M=multicolor, C=colorless) from real WUBRG
    const realColors = colors?.filter((c) => "WUBRG".includes(c)) ?? [];
    const wantMulti = colors?.includes("M") ?? false;
    const wantColorless = colors?.includes("C") ?? false;

    if (realColors.length > 0) {
      query = query.filter("oracle_cards.colors", "cs", JSON.stringify(realColors));
    }
    if (rarity) {
      query = query.eq("rarity", rarity.toLowerCase());
    }

    const { data } = await query;
    if (!data) return 0;

    // Post-fetch color filtering (same logic as getGauntletIllustrationsBySet)
    const filtered = (realColors.length > 0 || wantColorless)
      ? data.filter((p) => {
          const card = p.oracle_cards as unknown as { colors: string[] | null };
          const cc = card.colors ?? [];
          if (cc.length === 0) return wantColorless;
          if (cc.length > 1) return wantMulti;
          if (realColors.length > 0) return realColors.includes(cc[0]);
          return true;
        })
      : data;

    if (firstIllustrationOnly) {
      return new Set(filtered.map((d) => d.oracle_id)).size;
    }
    return new Set(filtered.map((d) => d.illustration_id)).size;
  }

  if (source === "tribe") {
    // Count oracle_cards matching this creature subtype
    let query = admin
      .from("oracle_cards")
      .select("oracle_id", { count: "exact", head: true })
      .ilike("type_line", `%${sourceId}%`);

    if (type) {
      query = query.ilike("type_line", `%${type}%`);
    }
    if (subtype) {
      query = query.ilike("type_line", `%${subtype}%`);
    }
    if (rulesText) {
      query = query.ilike("oracle_text", `%${rulesText}%`);
    }
    if (colors && colors.length > 0) {
      query = query.filter("colors", "cs", JSON.stringify(colors));
    }

    const { count } = await query;
    return count ?? 0;
  }

  if (source === "tag") {
    const { data } = await admin.rpc("count_cards_by_tag_filtered", {
      p_tag_id: sourceId,
      p_colors: colors?.length ? colors : null,
      p_type: type || null,
      p_subtype: subtype || null,
      p_rules_text: rulesText || null,
    });
    return data ?? 0;
  }

  if (source === "all") {
    // Count all matching oracle_cards with filters
    let query = admin
      .from("oracle_cards")
      .select("oracle_id", { count: "exact", head: true })
      .eq("digital_only", false);

    if (type) {
      query = query.ilike("type_line", `%${type}%`);
    }
    if (subtype) {
      query = query.ilike("type_line", `%${subtype}%`);
    }
    if (rulesText) {
      query = query.ilike("oracle_text", `%${rulesText}%`);
    }
    if (colors && colors.length > 0) {
      query = query.filter("colors", "cs", JSON.stringify(colors));
    }

    const { count } = await query;
    return count ?? 0;
  }

  return 0;
}
