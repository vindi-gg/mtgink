import { getDb } from "./db";
import type { BracketCard } from "./types";

type RawBracketCard = Omit<BracketCard, "slug">;

/** Convert a card name to a URL slug (mirrors queries.ts slugify) */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Compute slug, disambiguating duplicate names (tokens etc.) */
function computeSlug(card: { oracle_id: string; name: string; type_line: string | null }): string {
  const db = getDb();
  const base = slugify(card.name);

  const dupeCount = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM oracle_cards WHERE name = ? AND oracle_id != ?")
      .get(card.name, card.oracle_id) as { cnt: number }
  ).cnt;

  if (dupeCount === 0) return base;

  const isToken = card.type_line?.startsWith("Token") ?? false;

  if (!isToken) {
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

/** Get random bracket cards — one representative printing per unique card */
export function getRandomBracketCards(count = 32): BracketCard[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        o.oracle_id,
        o.name,
        o.type_line,
        p.artist,
        p.set_code,
        s.name as set_name,
        p.collector_number,
        p.illustration_id
      FROM oracle_cards o
      JOIN printings p ON p.oracle_id = o.oracle_id
      JOIN sets s ON p.set_code = s.set_code
      WHERE o.type_line NOT LIKE 'Token%'
        AND o.type_line NOT LIKE '%Emblem%'
        AND p.local_image_art_crop IS NOT NULL
        AND p.illustration_id IS NOT NULL
        AND p.scryfall_id = (
          SELECT p2.scryfall_id
          FROM printings p2
          JOIN sets s2 ON p2.set_code = s2.set_code
          WHERE p2.oracle_id = o.oracle_id
            AND p2.local_image_art_crop IS NOT NULL
            AND p2.illustration_id IS NOT NULL
          ORDER BY
            CASE s2.set_type
              WHEN 'expansion' THEN 1
              WHEN 'core' THEN 2
              WHEN 'masters' THEN 3
              WHEN 'draft_innovation' THEN 4
              WHEN 'commander' THEN 5
              ELSE 6
            END,
            p2.released_at DESC
          LIMIT 1
        )
      ORDER BY RANDOM()
      LIMIT ?
    `
    )
    .all(count) as RawBracketCard[];

  return rows.map((row) => ({
    ...row,
    slug: computeSlug(row),
  }));
}
