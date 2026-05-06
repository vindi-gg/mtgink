-- Tables for the Moxfield Commander deck scrape that feeds the per-
-- illustration popularity signal. See .claude/plans/moxfield-popularity-scrape.md
-- for the full plan.
--
-- moxfield_scrape_queue: deck_ids found by the discovery worker; the
--   fetcher picks pending rows and pulls full deck contents.
-- moxfield_decks:        one row per fetched deck with metadata.
-- moxfield_deck_cards:   one row per (deck, scryfall_id, board) — many
--                        cards per deck; aggregated nightly into
--                        popularity_signals.

CREATE TABLE IF NOT EXISTS moxfield_scrape_queue (
  deck_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fetched_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ,
  error TEXT,
  retry_count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_moxfield_queue_pending
  ON moxfield_scrape_queue (discovered_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS moxfield_decks (
  deck_id TEXT PRIMARY KEY,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ,
  format TEXT,
  card_count INT
);
CREATE INDEX IF NOT EXISTS idx_moxfield_decks_lastupd
  ON moxfield_decks (last_updated_at DESC);

CREATE TABLE IF NOT EXISTS moxfield_deck_cards (
  deck_id TEXT NOT NULL REFERENCES moxfield_decks(deck_id) ON DELETE CASCADE,
  scryfall_id UUID NOT NULL,
  quantity INT NOT NULL,
  board TEXT NOT NULL,
  PRIMARY KEY (deck_id, scryfall_id, board)
);
CREATE INDEX IF NOT EXISTS idx_moxfield_deck_cards_scry
  ON moxfield_deck_cards (scryfall_id);
