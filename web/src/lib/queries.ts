import { getDb } from "./db";
import { getVotesDb } from "./votes-db";
import { calculateElo, DEFAULT_RATING, K_AUTHENTICATED, K_ANONYMOUS } from "./elo";
import type {
  OracleCard,
  OracleCardFull,
  Illustration,
  Printing,
  ArtRating,
  ComparisonPair,
  VotePayload,
  VoteHistoryEntry,
  FavoriteEntry,
  MtgSet,
  SetCard,
} from "./types";

/** Convert a card name to a URL slug */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type RawOracleCard = Omit<OracleCard, "slug">;

/** Compute full slug for a card, disambiguating duplicate names (tokens) */
function computeSlug(card: RawOracleCard): string {
  const db = getDb();
  const base = slugify(card.name);

  const dupeCount = (
    db
      .prepare(
        "SELECT COUNT(*) as cnt FROM oracle_cards WHERE name = ? AND oracle_id != ?"
      )
      .get(card.name, card.oracle_id) as { cnt: number }
  ).cnt;

  if (dupeCount === 0) return base;

  const isToken = card.type_line?.startsWith("Token") ?? false;

  if (!isToken) {
    // Non-token: gets plain slug unless another non-token shares the name
    const nonTokenDupes = (
      db
        .prepare(
          "SELECT COUNT(*) as cnt FROM oracle_cards WHERE name = ? AND oracle_id != ? AND (type_line IS NULL OR type_line NOT LIKE 'Token%')"
        )
        .get(card.name, card.oracle_id) as { cnt: number }
    ).cnt;
    if (nonTokenDupes === 0) return base;
    return `${base}-${card.oracle_id.slice(0, 8)}`;
  }

  // Token: add -token suffix
  const tokenDupes = (
    db
      .prepare(
        "SELECT COUNT(*) as cnt FROM oracle_cards WHERE name = ? AND oracle_id != ? AND type_line LIKE 'Token%'"
      )
      .get(card.name, card.oracle_id) as { cnt: number }
  ).cnt;

  if (tokenDupes === 0) return `${base}-token`;
  return `${base}-token-${card.oracle_id.slice(0, 8)}`;
}

/** Add slug field to a raw oracle card row */
function addSlug(card: RawOracleCard): OracleCard {
  return { ...card, slug: computeSlug(card) };
}

/** Get a random card that has 2+ distinct illustrations */
export function getRandomComparableCard(): OracleCard {
  const db = getDb();
  const row = db
    .prepare(
      `
    SELECT o.oracle_id, o.name, o.layout, o.type_line
    FROM oracle_cards o
    WHERE (
      SELECT COUNT(DISTINCT p.illustration_id)
      FROM printings p
      WHERE p.oracle_id = o.oracle_id AND p.illustration_id IS NOT NULL
    ) >= 2
    ORDER BY RANDOM()
    LIMIT 1
  `
    )
    .get() as RawOracleCard;
  return addSlug(row);
}

/** Get all distinct illustrations for a card, picking one representative printing per illustration.
 *  Prefers main set printings (expansion, core) over promos for better image availability. */
export function getIllustrationsForCard(
  oracleId: string
): Illustration[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT
      p.illustration_id,
      p.oracle_id,
      p.artist,
      p.set_code,
      s.name as set_name,
      p.collector_number,
      p.released_at
    FROM printings p
    JOIN sets s ON p.set_code = s.set_code
    WHERE p.oracle_id = ?
      AND p.illustration_id IS NOT NULL
      AND p.scryfall_id = (
        SELECT p2.scryfall_id
        FROM printings p2
        JOIN sets s2 ON p2.set_code = s2.set_code
        WHERE p2.illustration_id = p.illustration_id
          AND p2.oracle_id = p.oracle_id
        ORDER BY
          CASE s2.set_type
            WHEN 'expansion' THEN 1
            WHEN 'core' THEN 2
            WHEN 'draft_innovation' THEN 3
            WHEN 'masters' THEN 4
            WHEN 'commander' THEN 5
            ELSE 6
          END,
          p2.released_at ASC
        LIMIT 1
      )
    ORDER BY p.released_at ASC
  `
    )
    .all(oracleId) as Illustration[];
  return rows;
}

/** Get ELO rating for an illustration, or null if unrated */
export function getRating(illustrationId: string): ArtRating | null {
  const votesDb = getVotesDb();
  const row = votesDb
    .prepare("SELECT * FROM art_ratings WHERE illustration_id = ?")
    .get(illustrationId) as ArtRating | undefined;
  return row ?? null;
}

/** Get or create an ELO rating for an illustration */
function ensureRating(illustrationId: string, oracleId: string): ArtRating {
  const votesDb = getVotesDb();
  const existing = getRating(illustrationId);
  if (existing) return existing;

  votesDb
    .prepare(
      `INSERT INTO art_ratings (illustration_id, oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
       VALUES (?, ?, ?, 0, 0, 0, datetime('now'))`
    )
    .run(illustrationId, oracleId, DEFAULT_RATING);

  return getRating(illustrationId)!;
}

/** Build a comparison pair for a card - picks two random distinct illustrations */
export function getComparisonPair(oracleId?: string): ComparisonPair {
  const card = oracleId ? getCardByOracleId(oracleId) : getRandomComparableCard();
  if (!card) throw new Error("No comparable card found");

  const illustrations = getIllustrationsForCard(card.oracle_id);
  if (illustrations.length < 2) throw new Error("Card has fewer than 2 illustrations");

  // Pick two random distinct illustrations
  const shuffled = illustrations.sort(() => Math.random() - 0.5);
  const a = shuffled[0];
  const b = shuffled[1];

  return {
    card,
    a,
    b,
    a_rating: getRating(a.illustration_id),
    b_rating: getRating(b.illustration_id),
  };
}

/** Get a card by oracle_id */
export function getCardByOracleId(oracleId: string): OracleCard | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT oracle_id, name, layout, type_line FROM oracle_cards WHERE oracle_id = ?"
    )
    .get(oracleId) as RawOracleCard | undefined;
  return row ? addSlug(row) : null;
}

/** Get a card by URL slug, with UUID fallback */
export function getCardBySlug(slug: string): OracleCard | null {
  // UUID fallback: if it looks like a UUID, query by oracle_id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(slug)) {
    return getCardByOracleId(slug);
  }

  const db = getDb();

  // Parse possible oracle_id suffix (8 hex chars at end)
  let oraclePrefix: string | null = null;
  let searchSlug = slug;
  const prefixMatch = slug.match(/^(.+)-([0-9a-f]{8})$/);
  if (prefixMatch) {
    oraclePrefix = prefixMatch[2];
    searchSlug = prefixMatch[1];
  }

  // Check for -token suffix
  let wantToken = false;
  if (searchSlug.endsWith("-token")) {
    wantToken = true;
    searchSlug = searchSlug.slice(0, -6);
  }

  // Convert slug to LIKE pattern (hyphens → %)
  // Strip apostrophes in SQL to match slugify behavior
  const likePattern = searchSlug.replace(/-/g, "%");

  const candidates = db
    .prepare(
      "SELECT oracle_id, name, layout, type_line FROM oracle_cards WHERE REPLACE(LOWER(name), '''', '') LIKE ?"
    )
    .all(likePattern) as RawOracleCard[];

  // Filter to exact slug match on the base name
  let matches = candidates.filter((c) => slugify(c.name) === searchSlug);

  if (matches.length === 0) return null;
  if (matches.length === 1) return addSlug(matches[0]);

  // Multiple matches — disambiguate
  if (wantToken) {
    matches = matches.filter((c) => c.type_line?.startsWith("Token"));
  } else {
    // Prefer non-token
    const nonTokens = matches.filter(
      (c) => !c.type_line?.startsWith("Token")
    );
    if (nonTokens.length > 0) matches = nonTokens;
  }

  // Apply oracle_id prefix filter
  if (oraclePrefix && matches.length > 1) {
    const prefixed = matches.filter((c) =>
      c.oracle_id.startsWith(oraclePrefix!)
    );
    if (prefixed.length > 0) matches = prefixed;
  }

  return matches.length > 0 ? addSlug(matches[0]) : null;
}

/** Get all printings for a card, grouped by illustration_id */
export function getPrintingsForCard(
  oracleId: string
): Map<string, Printing[]> {
  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT
      p.scryfall_id,
      p.illustration_id,
      p.set_code,
      s.name as set_name,
      p.collector_number,
      p.released_at,
      p.rarity,
      p.tcgplayer_id
    FROM printings p
    JOIN sets s ON p.set_code = s.set_code
    WHERE p.oracle_id = ?
      AND p.illustration_id IS NOT NULL
    ORDER BY p.released_at ASC
  `
    )
    .all(oracleId) as (Printing & { illustration_id: string })[];

  const grouped = new Map<string, Printing[]>();
  for (const row of rows) {
    const illId = row.illustration_id;
    if (!grouped.has(illId)) grouped.set(illId, []);
    grouped.get(illId)!.push({
      scryfall_id: row.scryfall_id,
      set_code: row.set_code,
      set_name: row.set_name,
      collector_number: row.collector_number,
      released_at: row.released_at,
      rarity: row.rarity,
      tcgplayer_id: row.tcgplayer_id,
    });
  }
  return grouped;
}

/** Record a vote and update ELO ratings */
export function recordVote(payload: VotePayload): {
  winnerRating: ArtRating;
  loserRating: ArtRating;
} {
  const votesDb = getVotesDb();

  const winner = ensureRating(payload.winner_illustration_id, payload.oracle_id);
  const loser = ensureRating(payload.loser_illustration_id, payload.oracle_id);

  const k = payload.user_id ? K_AUTHENTICATED : K_ANONYMOUS;
  const { newWinnerRating, newLoserRating } = calculateElo(
    winner.elo_rating,
    loser.elo_rating,
    k
  );

  const updateStmt = votesDb.prepare(`
    UPDATE art_ratings
    SET elo_rating = ?, vote_count = vote_count + 1, win_count = win_count + ?, loss_count = loss_count + ?, updated_at = datetime('now')
    WHERE illustration_id = ?
  `);

  const insertVote = votesDb.prepare(`
    INSERT INTO votes (oracle_id, winner_illustration_id, loser_illustration_id, session_id, user_id, voted_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  const runTransaction = votesDb.transaction(() => {
    updateStmt.run(newWinnerRating, 1, 0, payload.winner_illustration_id);
    updateStmt.run(newLoserRating, 0, 1, payload.loser_illustration_id);
    insertVote.run(
      payload.oracle_id,
      payload.winner_illustration_id,
      payload.loser_illustration_id,
      payload.session_id,
      payload.user_id ?? null
    );
  });

  runTransaction();

  return {
    winnerRating: getRating(payload.winner_illustration_id)!,
    loserRating: getRating(payload.loser_illustration_id)!,
  };
}

/** Get all ratings for a card's illustrations, sorted by ELO desc */
export function getRatingsForCard(oracleId: string): ArtRating[] {
  const votesDb = getVotesDb();
  return votesDb
    .prepare(
      "SELECT * FROM art_ratings WHERE oracle_id = ? ORDER BY elo_rating DESC"
    )
    .all(oracleId) as ArtRating[];
}

/** Search cards by name, limited to those with 2+ illustrations */
export function searchCards(query: string, limit = 20): OracleCard[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT o.oracle_id, o.name, o.layout, o.type_line
    FROM oracle_cards o
    WHERE o.name LIKE ?
      AND (
        SELECT COUNT(DISTINCT p.illustration_id)
        FROM printings p
        WHERE p.oracle_id = o.oracle_id AND p.illustration_id IS NOT NULL
      ) >= 2
    ORDER BY o.name
    LIMIT ?
  `
    )
    .all(`%${query}%`, limit) as RawOracleCard[];
  return rows.map(addSlug);
}

/** Get vote history for a user, joining across both databases */
export function getUserVoteHistory(
  userId: string,
  limit = 50,
  offset = 0
): { votes: VoteHistoryEntry[]; total: number } {
  const votesDb = getVotesDb();
  const db = getDb();

  // Get total count
  const { total } = votesDb
    .prepare("SELECT COUNT(*) as total FROM votes WHERE user_id = ?")
    .get(userId) as { total: number };

  // Get paginated votes
  const rawVotes = votesDb
    .prepare(
      `SELECT rowid as vote_id, oracle_id, winner_illustration_id, loser_illustration_id, voted_at
       FROM votes
       WHERE user_id = ?
       ORDER BY voted_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset) as {
    vote_id: number;
    oracle_id: string;
    winner_illustration_id: string;
    loser_illustration_id: string;
    voted_at: string;
  }[];

  // For each vote, look up card name and representative printings from the card DB
  const getPrinting = db.prepare(
    `SELECT p.set_code, p.collector_number
     FROM printings p
     WHERE p.illustration_id = ?
     LIMIT 1`
  );

  const getCard = db.prepare(
    "SELECT oracle_id, name, layout, type_line FROM oracle_cards WHERE oracle_id = ?"
  );

  const votes: VoteHistoryEntry[] = rawVotes.map((v) => {
    const card = getCard.get(v.oracle_id) as RawOracleCard | undefined;
    const winner = getPrinting.get(v.winner_illustration_id) as
      | { set_code: string; collector_number: string }
      | undefined;
    const loser = getPrinting.get(v.loser_illustration_id) as
      | { set_code: string; collector_number: string }
      | undefined;

    return {
      vote_id: v.vote_id,
      card_name: card?.name ?? "Unknown",
      card_slug: card ? computeSlug(card) : "unknown",
      oracle_id: v.oracle_id,
      winner_illustration_id: v.winner_illustration_id,
      loser_illustration_id: v.loser_illustration_id,
      winner_set_code: winner?.set_code ?? "",
      winner_collector_number: winner?.collector_number ?? "",
      loser_set_code: loser?.set_code ?? "",
      loser_collector_number: loser?.collector_number ?? "",
      voted_at: v.voted_at,
    };
  });

  return { votes, total };
}

/** Add an illustration to a user's favorites */
export function addFavorite(
  userId: string,
  illustrationId: string,
  oracleId: string
): void {
  const votesDb = getVotesDb();
  votesDb
    .prepare(
      "INSERT OR IGNORE INTO favorites (user_id, illustration_id, oracle_id) VALUES (?, ?, ?)"
    )
    .run(userId, illustrationId, oracleId);
}

/** Remove an illustration from a user's favorites */
export function removeFavorite(
  userId: string,
  illustrationId: string
): void {
  const votesDb = getVotesDb();
  votesDb
    .prepare("DELETE FROM favorites WHERE user_id = ? AND illustration_id = ?")
    .run(userId, illustrationId);
}

/** Batch check which illustration IDs are favorited by a user */
export function getFavoritedIllustrations(
  userId: string,
  illustrationIds: string[]
): Set<string> {
  if (illustrationIds.length === 0) return new Set();
  const votesDb = getVotesDb();
  const placeholders = illustrationIds.map(() => "?").join(",");
  const rows = votesDb
    .prepare(
      `SELECT illustration_id FROM favorites WHERE user_id = ? AND illustration_id IN (${placeholders})`
    )
    .all(userId, ...illustrationIds) as { illustration_id: string }[];
  return new Set(rows.map((r) => r.illustration_id));
}

/** Get a user's favorited illustrations with card info, paginated */
export function getUserFavorites(
  userId: string,
  limit = 50,
  offset = 0
): { favorites: FavoriteEntry[]; total: number } {
  const votesDb = getVotesDb();
  const db = getDb();

  const { total } = votesDb
    .prepare("SELECT COUNT(*) as total FROM favorites WHERE user_id = ?")
    .get(userId) as { total: number };

  const rawFavorites = votesDb
    .prepare(
      `SELECT illustration_id, oracle_id, created_at
       FROM favorites
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset) as {
    illustration_id: string;
    oracle_id: string;
    created_at: string;
  }[];

  const getCard = db.prepare(
    "SELECT oracle_id, name, layout, type_line FROM oracle_cards WHERE oracle_id = ?"
  );
  const getPrinting = db.prepare(
    `SELECT p.artist, p.set_code, p.collector_number
     FROM printings p
     WHERE p.illustration_id = ? AND p.oracle_id = ?
     LIMIT 1`
  );

  const favorites: FavoriteEntry[] = rawFavorites.map((f) => {
    const card = getCard.get(f.oracle_id) as RawOracleCard | undefined;
    const printing = getPrinting.get(f.illustration_id, f.oracle_id) as
      | { artist: string; set_code: string; collector_number: string }
      | undefined;

    return {
      illustration_id: f.illustration_id,
      oracle_id: f.oracle_id,
      card_name: card?.name ?? "Unknown",
      card_slug: card ? computeSlug(card) : "unknown",
      artist: printing?.artist ?? "Unknown",
      set_code: printing?.set_code ?? "",
      collector_number: printing?.collector_number ?? "",
      created_at: f.created_at,
    };
  });

  return { favorites, total };
}

const PLAYABLE_SET_TYPES = [
  "expansion",
  "core",
  "masters",
  "draft_innovation",
  "commander",
];

/** Get playable sets (expansion, core, masters, etc.), non-digital only */
export function getPlayableSets(): MtgSet[] {
  const db = getDb();
  const placeholders = PLAYABLE_SET_TYPES.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT set_code, name, set_type, released_at, card_count, printed_size,
              icon_svg_uri, parent_set_code, block_code, block, digital
       FROM sets
       WHERE set_type IN (${placeholders}) AND digital = 0
       ORDER BY released_at DESC`
    )
    .all(...PLAYABLE_SET_TYPES) as MtgSet[];
}

/** Get all sets, ordered by release date desc */
export function getAllSets(): MtgSet[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT set_code, name, set_type, released_at, card_count, printed_size,
              icon_svg_uri, parent_set_code, block_code, block, digital
       FROM sets
       ORDER BY released_at DESC`
    )
    .all() as MtgSet[];
}

/** Get a single set by code */
export function getSetByCode(setCode: string): MtgSet | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT set_code, name, set_type, released_at, card_count, printed_size,
              icon_svg_uri, parent_set_code, block_code, block, digital
       FROM sets
       WHERE set_code = ?`
    )
    .get(setCode) as MtgSet | undefined;
  return row ?? null;
}

/** Get all cards for a set, joined with oracle data, ordered by collector number */
export function getCardsForSet(setCode: string): SetCard[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.scryfall_id, p.oracle_id, o.name, p.collector_number,
              p.rarity, o.type_line, o.mana_cost
       FROM printings p
       JOIN oracle_cards o ON p.oracle_id = o.oracle_id
       WHERE p.set_code = ?
       ORDER BY
         CAST(p.collector_number AS INTEGER),
         p.collector_number`
    )
    .all(setCode) as (Omit<SetCard, "slug"> & { oracle_id: string; name: string })[];
  return rows.map((row) => ({
    ...row,
    slug: computeSlug({ oracle_id: row.oracle_id, name: row.name, layout: null, type_line: row.type_line }),
  }));
}

type RawOracleCardFull = Omit<OracleCardFull, "slug">;

/** Search all oracle cards by name (no illustration count filter) */
export function searchAllCards(query: string, limit = 50): OracleCardFull[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT oracle_id, name, layout, type_line, mana_cost, colors, cmc
       FROM oracle_cards
       WHERE name LIKE ?
       ORDER BY name
       LIMIT ?`
    )
    .all(`%${query}%`, limit) as RawOracleCardFull[];
  return rows.map((row) => ({
    ...row,
    slug: computeSlug(row),
  }));
}
