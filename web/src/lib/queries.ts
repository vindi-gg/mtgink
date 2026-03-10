import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type {
  OracleCard,
  Illustration,
  Printing,
  ArtRating,
  ComparisonPair,
  CompareFilters,
  VotePayload,
  VoteHistoryEntry,
  FavoriteEntry,
  MtgSet,
  SetCard,
  DecklistEntry,
  DeckCardWithArt,
  ClashCard,
  ClashPair,
  CardRating,
  CardVotePayload,
  Artist,
  ArtistStats,
  ArtistIllustration,
  Tribe,
  Tag,
  BrowseCard,
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

const VALID_COLORS = new Set(["W", "U", "B", "R", "G"]);

// --- In-memory card cache for fast random selection ---
interface CachedCard {
  oracle_id: string;
  name: string;
  slug: string;
  layout: string | null;
  type_line: string | null;
  mana_cost: string | null;
  colors: string[];
  cmc: number | null;
  illustration_count: number;
}

let cardCache: CachedCard[] | null = null;

type CardCacheRow = { oracle_id: string; name: string; slug: string; layout: string | null; type_line: string | null; mana_cost: string | null; colors: string[] | null; cmc: number | null; illustration_count: number };

async function getCardCache(): Promise<CachedCard[]> {
  if (cardCache) return cardCache;

  // Supabase PostgREST limits responses to 1000 rows — paginate to get all ~37K cards
  const PAGE_SIZE = 1000;
  const allRows: CardCacheRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await getAdminClient()
      .rpc("get_card_cache")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load card cache: ${error.message}`);
    const rows = data as CardCacheRow[];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  cardCache = allRows.map((r) => ({
    ...r,
    colors: r.colors ?? [],
  }));
  return cardCache;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function filterCards(cards: CachedCard[], filters?: CompareFilters, minIllustrations = 2): CachedCard[] {
  let result = cards.filter((c) => c.illustration_count >= minIllustrations);

  if (!filters) return result;

  if (filters.colors && filters.colors.length > 0) {
    const hasColorless = filters.colors.includes("C");
    const realColors = filters.colors.filter((c) => VALID_COLORS.has(c));

    if (hasColorless && realColors.length === 0) {
      result = result.filter((c) => c.colors.length === 0);
    } else {
      for (const color of realColors) {
        result = result.filter((c) => c.colors.includes(color));
      }
    }
  }

  if (filters.type) {
    const t = filters.type;
    result = result.filter((c) => c.type_line?.includes(t));
  }

  if (filters.subtype) {
    const st = filters.subtype;
    result = result.filter((c) => {
      if (!c.type_line) return false;
      const afterDash = c.type_line.split("\u2014")[1];
      return afterDash?.includes(st);
    });
  }

  return result;
}

function cachedToOracleCard(c: CachedCard): OracleCard {
  return {
    oracle_id: c.oracle_id,
    name: c.name,
    slug: c.slug,
    layout: c.layout,
    type_line: c.type_line,
    mana_cost: c.mana_cost,
    colors: c.colors.length > 0 ? JSON.stringify(c.colors) : null,
    cmc: c.cmc,
  };
}

/** Get a random card that has 2+ distinct illustrations (uses in-memory cache) */
export async function getRandomComparableCard(filters?: CompareFilters): Promise<OracleCard> {
  const candidates = filterCards(await getCardCache(), filters, 2);
  if (candidates.length === 0) throw new Error("No cards match the selected filters");
  return cachedToOracleCard(pickRandom(candidates));
}

/** Get a cross-card comparison pair: two different cards matching filters, one illustration each */
export async function getCrossCardPair(filters?: CompareFilters): Promise<ComparisonPair> {
  const candidates = filterCards(await getCardCache(), filters, 1);
  if (candidates.length < 2) throw new Error("Not enough cards match the selected filters");

  const idxA = Math.floor(Math.random() * candidates.length);
  let idxB = Math.floor(Math.random() * (candidates.length - 1));
  if (idxB >= idxA) idxB++;

  const cardA = cachedToOracleCard(candidates[idxA]);
  const cardB = cachedToOracleCard(candidates[idxB]);

  // Single RPC: get one random illustration from each card with ratings
  const { data, error } = await getAdminClient().rpc("get_cross_comparison_pair", {
    p_oracle_id_a: cardA.oracle_id,
    p_oracle_id_b: cardB.oracle_id,
  });

  if (error || !data || data.length < 2) {
    throw new Error(`Failed to get cross comparison pair: ${error?.message ?? "insufficient data"}`);
  }

  // Match rows back to cards (row oracle_id tells us which card it belongs to)
  const rowA = data.find((r: IllustrationWithRating) => r.oracle_id === cardA.oracle_id) ?? data[0];
  const rowB = data.find((r: IllustrationWithRating) => r.oracle_id === cardB.oracle_id) ?? data[1];

  return {
    card: cardA,
    card_b: cardB,
    a: toIllustration(rowA),
    b: toIllustration(rowB),
    a_rating: toRating(rowA),
    b_rating: toRating(rowB),
  };
}

/** Get all distinct illustrations for a card, picking one representative printing per illustration */
export async function getIllustrationsForCard(oracleId: string): Promise<Illustration[]> {
  const { data, error } = await getAdminClient().rpc("get_illustrations_for_card", {
    p_oracle_id: oracleId,
  });
  if (error) throw new Error(`Failed to get illustrations: ${error.message}`);
  return data as Illustration[];
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

  const card = oracleId
    ? await getCardByOracleId(oracleId)
    : await getRandomComparableCard(filters);
  if (!card) throw new Error("No comparable card found");

  // Single RPC: get 2 random illustrations with their ratings
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
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc")
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
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc")
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
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc")
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

/** Get all printings for a card, grouped by illustration_id */
export async function getPrintingsForCard(oracleId: string): Promise<Map<string, Printing[]>> {
  const { data, error } = await getAdminClient()
    .from("printings")
    .select("scryfall_id, illustration_id, set_code, collector_number, released_at, rarity, tcgplayer_id, image_version, sets!inner(name)")
    .eq("oracle_id", oracleId)
    .not("illustration_id", "is", null)
    .order("released_at", { ascending: true });

  if (error) throw new Error(`Failed to get printings: ${error.message}`);

  const grouped = new Map<string, Printing[]>();
  for (const row of data ?? []) {
    const illId = row.illustration_id as string;
    if (!grouped.has(illId)) grouped.set(illId, []);
    grouped.get(illId)!.push({
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

/** Record a vote and update ELO ratings */
export async function recordVote(payload: VotePayload, kFactor?: number): Promise<{
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

/** Search cards by name, limited to those with 2+ illustrations, sorted by popularity */
export async function searchCards(query: string, limit = 20): Promise<(OracleCard & { illustration_count?: number })[]> {
  const { data, error } = await getAdminClient().rpc("search_cards_with_art", {
    p_query: query,
    p_limit: limit,
  });

  if (error) throw new Error(`Search failed: ${error.message}`);

  return (data ?? []).map((row: { oracle_id: string; name: string; slug: string; layout: string | null; type_line: string | null; mana_cost: string | null; colors: unknown; cmc: number | null; illustration_count?: number }) => ({
    ...row,
    colors: row.colors ? JSON.stringify(row.colors) : null,
  }));
}

/** Get vote history for a user */
export async function getUserVoteHistory(
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ votes: VoteHistoryEntry[]; total: number }> {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase not configured");

  // Get total count
  const { count } = await supabase
    .from("votes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  // Get paginated votes with card info
  const { data: rawVotes } = await supabase
    .from("votes")
    .select("id, oracle_id, winner_illustration_id, loser_illustration_id, voted_at")
    .eq("user_id", userId)
    .order("voted_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (!rawVotes || rawVotes.length === 0) return { votes: [], total: count ?? 0 };

  // Batch lookup card names and printings
  const oracleIds = [...new Set(rawVotes.map((v) => v.oracle_id))];
  const illustrationIds = [
    ...new Set(rawVotes.flatMap((v) => [v.winner_illustration_id, v.loser_illustration_id])),
  ];

  const [{ data: cards }, { data: printingRows }] = await Promise.all([
    getAdminClient()
      .from("oracle_cards")
      .select("oracle_id, name, slug, type_line")
      .in("oracle_id", oracleIds),
    getAdminClient()
      .from("printings")
      .select("illustration_id, set_code, collector_number, image_version")
      .in("illustration_id", illustrationIds),
  ]);

  const cardMap = new Map((cards ?? []).map((c) => [c.oracle_id, c]));
  const printingMap = new Map((printingRows ?? []).map((p) => [p.illustration_id, p]));

  const votes: VoteHistoryEntry[] = rawVotes.map((v) => {
    const card = cardMap.get(v.oracle_id);
    const winner = printingMap.get(v.winner_illustration_id);
    const loser = printingMap.get(v.loser_illustration_id);

    return {
      vote_id: v.id,
      card_name: card?.name ?? "Unknown",
      card_slug: card?.slug ?? "unknown",
      oracle_id: v.oracle_id,
      winner_illustration_id: v.winner_illustration_id,
      loser_illustration_id: v.loser_illustration_id,
      winner_set_code: winner?.set_code ?? "",
      winner_collector_number: winner?.collector_number ?? "",
      winner_image_version: winner?.image_version ?? null,
      loser_set_code: loser?.set_code ?? "",
      loser_collector_number: loser?.collector_number ?? "",
      loser_image_version: loser?.image_version ?? null,
      voted_at: v.voted_at,
    };
  });

  return { votes, total: count ?? 0 };
}

/** Add an illustration to a user's favorites */
export async function addFavorite(
  userId: string,
  illustrationId: string,
  oracleId: string
): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase
    .from("favorites")
    .upsert({ user_id: userId, illustration_id: illustrationId, oracle_id: oracleId });
}

/** Remove an illustration from a user's favorites */
export async function removeFavorite(
  userId: string,
  illustrationId: string
): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("illustration_id", illustrationId);
}

/** Batch check which illustration IDs are favorited by a user */
export async function getFavoritedIllustrations(
  userId: string,
  illustrationIds: string[]
): Promise<Set<string>> {
  if (illustrationIds.length === 0) return new Set();
  const supabase = await createClient();
  if (!supabase) return new Set();

  const { data } = await supabase
    .from("favorites")
    .select("illustration_id")
    .eq("user_id", userId)
    .in("illustration_id", illustrationIds);

  return new Set((data ?? []).map((r) => r.illustration_id));
}

/** Get a user's favorited illustrations with card info, paginated */
export async function getUserFavorites(
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ favorites: FavoriteEntry[]; total: number }> {
  const supabase = await createClient();
  if (!supabase) return { favorites: [], total: 0 };

  const { count } = await supabase
    .from("favorites")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const { data: rawFavorites } = await supabase
    .from("favorites")
    .select("illustration_id, oracle_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (!rawFavorites || rawFavorites.length === 0) return { favorites: [], total: count ?? 0 };

  // Batch lookups
  const oracleIds = [...new Set(rawFavorites.map((f) => f.oracle_id))];
  const illustrationIds = rawFavorites.map((f) => f.illustration_id);

  const [{ data: cards }, { data: printingRows }] = await Promise.all([
    getAdminClient()
      .from("oracle_cards")
      .select("oracle_id, name, slug, type_line")
      .in("oracle_id", oracleIds),
    getAdminClient()
      .from("printings")
      .select("illustration_id, oracle_id, artist, set_code, collector_number, image_version")
      .in("illustration_id", illustrationIds),
  ]);

  const cardMap = new Map((cards ?? []).map((c) => [c.oracle_id, c]));
  const printingMap = new Map((printingRows ?? []).map((p) => [p.illustration_id, p]));

  const favorites: FavoriteEntry[] = rawFavorites.map((f) => {
    const card = cardMap.get(f.oracle_id);
    const printing = printingMap.get(f.illustration_id);

    return {
      illustration_id: f.illustration_id,
      oracle_id: f.oracle_id,
      card_name: card?.name ?? "Unknown",
      card_slug: card?.slug ?? "unknown",
      artist: printing?.artist ?? "Unknown",
      set_code: printing?.set_code ?? "",
      collector_number: printing?.collector_number ?? "",
      image_version: printing?.image_version ?? null,
      created_at: f.created_at,
    };
  });

  return { favorites, total: count ?? 0 };
}

const PLAYABLE_SET_TYPES = ["expansion", "core", "masters", "draft_innovation", "commander"];

/** Get playable sets (expansion, core, masters, etc.), non-digital only */
export async function getPlayableSets(): Promise<MtgSet[]> {
  const { data } = await getAdminClient()
    .from("sets")
    .select("*")
    .in("set_type", PLAYABLE_SET_TYPES)
    .eq("digital", false)
    .order("released_at", { ascending: false });
  return (data ?? []) as MtgSet[];
}

/** Get all sets, ordered by release date desc */
export async function getAllSets(): Promise<MtgSet[]> {
  const { data } = await getAdminClient()
    .from("sets")
    .select("*")
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
    .select("scryfall_id, oracle_id, collector_number, rarity, image_version, oracle_cards!inner(name, slug, type_line, mana_cost)")
    .eq("set_code", setCode)
    .order("collector_number", { ascending: true });

  return (data ?? []).map((row) => {
    const card = row.oracle_cards as unknown as { name: string; slug: string; type_line: string | null; mana_cost: string | null };
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
    };
  });
}

/** Look up a card by exact name (case-insensitive), with split-card fallback */
export async function lookupCardByName(name: string): Promise<OracleCard | null> {
  // Exact match
  const { data: exact } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (exact) return { ...exact, colors: exact.colors ? JSON.stringify(exact.colors) : null };

  // Split card fallback: "Fire" → match "Fire // Ice"
  const { data: split } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc")
    .ilike("name", `${name} // %`)
    .limit(1)
    .maybeSingle();

  if (split) return { ...split, colors: split.colors ? JSON.stringify(split.colors) : null };

  return null;
}

/** Look up all cards from a decklist, returning matched cards with art and unmatched entries */
export async function lookupDeckCards(entries: DecklistEntry[]): Promise<{
  matched: DeckCardWithArt[];
  unmatched: DecklistEntry[];
}> {
  const matched: DeckCardWithArt[] = [];
  const unmatched: DecklistEntry[] = [];
  const seen = new Map<string, number>();

  for (const entry of entries) {
    const card = await lookupCardByName(entry.name);
    if (!card) {
      unmatched.push(entry);
      continue;
    }

    const existingIdx = seen.get(card.oracle_id);
    if (existingIdx !== undefined) {
      matched[existingIdx].quantity += entry.quantity;
      continue;
    }

    const [illustrations, ratings] = await Promise.all([
      getIllustrationsForCard(card.oracle_id),
      getRatingsForCard(card.oracle_id),
    ]);
    const ratingMap = new Map(ratings.map((r) => [r.illustration_id, r]));

    const illustrationsWithRatings = illustrations
      .map((ill) => ({
        ...ill,
        rating: ratingMap.get(ill.illustration_id) ?? null,
      }))
      .sort((a, b) => {
        const aElo = a.rating?.elo_rating ?? 1500;
        const bElo = b.rating?.elo_rating ?? 1500;
        return bElo - aElo;
      });

    seen.set(card.oracle_id, matched.length);
    matched.push({
      card,
      quantity: entry.quantity,
      section: entry.section,
      illustrations: illustrationsWithRatings,
    });
  }

  return { matched, unmatched };
}

/** Search all oracle cards by name (no illustration count filter) */
export async function searchAllCards(query: string, limit = 50): Promise<OracleCard[]> {
  const { data } = await getAdminClient()
    .from("oracle_cards")
    .select("oracle_id, name, slug, layout, type_line, mana_cost, colors, cmc")
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
  const candidates = filterCards(await getCardCache(), filters, 1);
  if (candidates.length < 2) throw new Error("Not enough cards match the selected filters");

  const idxA = Math.floor(Math.random() * candidates.length);
  let idxB = Math.floor(Math.random() * (candidates.length - 1));
  if (idxB >= idxA) idxB++;

  const cardA = candidates[idxA];
  const cardB = candidates[idxB];

  const { data, error } = await getAdminClient().rpc("get_clash_pair", {
    p_oracle_id_a: cardA.oracle_id,
    p_oracle_id_b: cardB.oracle_id,
  });

  if (error || !data || data.length < 2) {
    throw new Error(`Failed to get clash pair: ${error?.message ?? "insufficient data"}`);
  }

  const rowA = data.find((r: ClashPairRow) => r.oracle_id === cardA.oracle_id) ?? data[0];
  const rowB = data.find((r: ClashPairRow) => r.oracle_id === cardB.oracle_id) ?? data[1];

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
  sort: "illustrations" | "popular" = "illustrations",
  period: "week" | "month" | "all" = "all",
  limit = 100,
  offset = 0
): Promise<{ artists: (Artist & { total_votes?: number })[]; total: number }> {
  if (sort === "popular") {
    const { data, count, error } = await getAdminClient()
      .from("artist_stats")
      .select("artist_id, total_votes, artists!inner(id, name, slug, illustration_count, hero_set_code, hero_collector_number, hero_image_version)", { count: "exact" })
      .eq("period", period)
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

export async function getCardsByTribe(
  tribe: string,
  page = 1,
  pageSize = 60
): Promise<{ cards: BrowseCard[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [{ data, error }, { data: countData }] = await Promise.all([
    getAdminClient().rpc("get_cards_by_tribe", {
      p_slug: tribe, p_limit: pageSize, p_offset: offset,
    }),
    getAdminClient().rpc("count_cards_by_tribe", { p_slug: tribe }),
  ]);
  if (error) throw new Error(`Failed to load tribe cards: ${error.message}`);
  return { cards: (data ?? []) as BrowseCard[], total: countData ?? 0 };
}

// --- Tags (Scryfall Tagger) ---

export async function getTags(
  search?: string,
  type?: string,
  page = 1,
  pageSize = 50
): Promise<{ tags: Tag[]; total: number }> {
  const offset = (page - 1) * pageSize;
  let query = getAdminClient()
    .from("tags")
    .select("tag_id, label, type, description, usage_count", { count: "exact" })
    .order("usage_count", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (search) {
    query = query.ilike("label", `%${search}%`);
  }
  if (type) {
    query = query.eq("type", type);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to load tags: ${error.message}`);
  return { tags: (data ?? []) as Tag[], total: count ?? 0 };
}

export async function getTagById(tagId: string): Promise<Tag | null> {
  const { data } = await getAdminClient()
    .from("tags")
    .select("tag_id, label, type, description, usage_count")
    .eq("tag_id", tagId)
    .single();
  return data as Tag | null;
}

export async function getCardsByTag(
  tagId: string,
  page = 1,
  pageSize = 60
): Promise<{ cards: BrowseCard[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [{ data, error }, { data: countData }] = await Promise.all([
    getAdminClient().rpc("get_cards_by_tag", {
      p_tag_id: tagId, p_limit: pageSize, p_offset: offset,
    }),
    getAdminClient().rpc("count_cards_by_tag", { p_tag_id: tagId }),
  ]);
  if (error) throw new Error(`Failed to load tag cards: ${error.message}`);
  return { cards: (data ?? []) as BrowseCard[], total: countData ?? 0 };
}
