import crypto from "crypto";
import { getVotesDb } from "./votes-db";
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
import { getDb } from "./db";

export function createDeck(params: {
  userId: string;
  name: string;
  format?: string;
  sourceUrl?: string;
  isPublic?: boolean;
}): string {
  const votesDb = getVotesDb();
  const id = crypto.randomUUID();
  votesDb
    .prepare(
      `INSERT INTO decks (id, user_id, name, format, source_url, is_public)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      params.userId,
      params.name,
      params.format ?? null,
      params.sourceUrl ?? null,
      params.isPublic === false ? 0 : 1
    );
  return id;
}

export function getDecksByUser(
  userId: string,
  limit = 50,
  offset = 0
): { decks: DeckSummary[]; total: number } {
  const votesDb = getVotesDb();

  const { total } = votesDb
    .prepare("SELECT COUNT(*) as total FROM decks WHERE user_id = ?")
    .get(userId) as { total: number };

  const decks = votesDb
    .prepare(
      `SELECT d.*,
              COALESCE(SUM(dc.quantity), 0) as card_count,
              COUNT(dc.oracle_id) as unique_cards
       FROM decks d
       LEFT JOIN deck_cards dc ON d.id = dc.deck_id
       WHERE d.user_id = ?
       GROUP BY d.id
       ORDER BY d.updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset) as DeckSummary[];

  return { decks, total };
}

export function getDeckById(deckId: string): Deck | null {
  const votesDb = getVotesDb();
  const row = votesDb
    .prepare("SELECT * FROM decks WHERE id = ?")
    .get(deckId) as Deck | undefined;
  return row ?? null;
}

export function updateDeck(
  deckId: string,
  updates: { name?: string; format?: string; isPublic?: boolean }
): void {
  const votesDb = getVotesDb();
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (updates.name !== undefined) {
    sets.push("name = ?");
    values.push(updates.name);
  }
  if (updates.format !== undefined) {
    sets.push("format = ?");
    values.push(updates.format);
  }
  if (updates.isPublic !== undefined) {
    sets.push("is_public = ?");
    values.push(updates.isPublic ? 1 : 0);
  }

  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  values.push(deckId);

  votesDb
    .prepare(`UPDATE decks SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function deleteDeck(deckId: string): void {
  const votesDb = getVotesDb();
  // deck_cards has ON DELETE CASCADE, but sqlite needs PRAGMA foreign_keys = ON
  votesDb.exec("PRAGMA foreign_keys = ON");
  votesDb.prepare("DELETE FROM decks WHERE id = ?").run(deckId);
}

export function setDeckCards(
  deckId: string,
  cards: { oracleId: string; quantity: number; section: string }[]
): void {
  const votesDb = getVotesDb();

  const deleteAll = votesDb.prepare(
    "DELETE FROM deck_cards WHERE deck_id = ?"
  );
  const insert = votesDb.prepare(
    `INSERT INTO deck_cards (deck_id, oracle_id, quantity, section)
     VALUES (?, ?, ?, ?)`
  );
  const updateTimestamp = votesDb.prepare(
    "UPDATE decks SET updated_at = datetime('now') WHERE id = ?"
  );

  const tx = votesDb.transaction(() => {
    deleteAll.run(deckId);
    for (const card of cards) {
      insert.run(deckId, card.oracleId, card.quantity, card.section);
    }
    updateTimestamp.run(deckId);
  });

  tx();
}

export function getDeckDetail(deckId: string): DeckDetail | null {
  const deck = getDeckById(deckId);
  if (!deck) return null;

  const votesDb = getVotesDb();
  const deckCards = votesDb
    .prepare("SELECT * FROM deck_cards WHERE deck_id = ?")
    .all(deckId) as DeckCard[];

  const cards: DeckCardDetail[] = [];
  const unmatched: string[] = [];

  for (const dc of deckCards) {
    const card = getCardByOracleId(dc.oracle_id);
    if (!card) {
      unmatched.push(dc.oracle_id);
      continue;
    }

    const illustrations = getIllustrationsForCard(dc.oracle_id);
    const ratings = getRatingsForCard(dc.oracle_id);
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

    cards.push({
      ...dc,
      card,
      illustrations: illustrationsWithRatings,
    });
  }

  return { ...deck, cards, unmatched };
}

export function updateDeckCard(
  deckId: string,
  oracleId: string,
  updates: { selected_illustration_id?: string; to_buy?: boolean }
): void {
  const votesDb = getVotesDb();
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (updates.selected_illustration_id !== undefined) {
    sets.push("selected_illustration_id = ?");
    values.push(updates.selected_illustration_id);
  }
  if (updates.to_buy !== undefined) {
    sets.push("to_buy = ?");
    values.push(updates.to_buy ? 1 : 0);
  }

  if (sets.length === 0) return;
  values.push(deckId, oracleId);

  votesDb
    .prepare(
      `UPDATE deck_cards SET ${sets.join(", ")} WHERE deck_id = ? AND oracle_id = ?`
    )
    .run(...values);

  votesDb
    .prepare("UPDATE decks SET updated_at = datetime('now') WHERE id = ?")
    .run(deckId);
}

export function getUserPurchaseList(userId: string): PurchaseListItem[] {
  const votesDb = getVotesDb();
  const db = getDb();

  const rows = votesDb
    .prepare(
      `SELECT dc.deck_id, d.name as deck_name, dc.oracle_id,
              dc.selected_illustration_id
       FROM deck_cards dc
       JOIN decks d ON dc.deck_id = d.id
       WHERE d.user_id = ? AND dc.to_buy = 1`
    )
    .all(userId) as {
    deck_id: string;
    deck_name: string;
    oracle_id: string;
    selected_illustration_id: string | null;
  }[];

  const getCard = db.prepare(
    "SELECT oracle_id, name, layout, type_line FROM oracle_cards WHERE oracle_id = ?"
  );
  const getPrinting = db.prepare(
    `SELECT p.artist, p.set_code, p.collector_number, p.tcgplayer_id
     FROM printings p
     WHERE p.illustration_id = ? AND p.oracle_id = ?
     LIMIT 1`
  );
  const getDefaultPrinting = db.prepare(
    `SELECT p.illustration_id, p.artist, p.set_code, p.collector_number, p.tcgplayer_id
     FROM printings p
     WHERE p.oracle_id = ?
     ORDER BY p.released_at DESC
     LIMIT 1`
  );

  const items: PurchaseListItem[] = [];

  for (const row of rows) {
    const card = getCard.get(row.oracle_id) as
      | { oracle_id: string; name: string; layout: string | null; type_line: string | null }
      | undefined;
    if (!card) continue;

    const slug = card.name
      .toLowerCase()
      .replace(/'/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    let printing: {
      illustration_id?: string;
      artist: string;
      set_code: string;
      collector_number: string;
      tcgplayer_id: number | null;
    } | undefined;

    if (row.selected_illustration_id) {
      printing = getPrinting.get(row.selected_illustration_id, row.oracle_id) as typeof printing;
    }
    if (!printing) {
      printing = getDefaultPrinting.get(row.oracle_id) as typeof printing;
    }

    items.push({
      deck_id: row.deck_id,
      deck_name: row.deck_name,
      oracle_id: row.oracle_id,
      card_name: card.name,
      card_slug: slug,
      illustration_id: row.selected_illustration_id ?? printing?.illustration_id ?? null,
      artist: printing?.artist ?? "Unknown",
      set_code: printing?.set_code ?? "",
      collector_number: printing?.collector_number ?? "",
      tcgplayer_id: printing?.tcgplayer_id ?? null,
    });
  }

  return items;
}

export function lookupAndCreateDeck(
  userId: string,
  name: string,
  entries: DecklistEntry[],
  options?: { format?: string; sourceUrl?: string; isPublic?: boolean }
): { deckId: string; unmatched: string[] } {
  const deckId = createDeck({
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
    const card = lookupCardByName(entry.name);
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

  setDeckCards(deckId, cards);
  return { deckId, unmatched };
}
