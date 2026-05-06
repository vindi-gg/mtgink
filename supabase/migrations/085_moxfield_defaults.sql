-- Per-oracle-card "default printing" inferred from Moxfield deck data —
-- the printing that Moxfield's auto-add picks when a user doesn't choose
-- a specific version. Confirmed empirically: Moxfield exposes a
-- `latest=true` flag on its search results, and the most-used printing
-- in our scraped commander decks closely matches that printing for
-- well-reprinted cards (Sol Ring SOC/128 = 58% of all Sol Ring uses).
--
-- The aggregator subtracts uses of the default printing to produce the
-- `commander_chosen_30d` signal — the actual "art was deliberately
-- picked" popularity, with auto-default noise filtered out.

CREATE TABLE IF NOT EXISTS moxfield_defaults (
  oracle_id UUID PRIMARY KEY REFERENCES oracle_cards(oracle_id) ON DELETE CASCADE,
  default_scryfall_id UUID,        -- no FK on purpose: deck data may reference printings outside our DB
  source TEXT NOT NULL,            -- 'inferred' (mode of deck data) | 'api' (Moxfield-supplied)
  confidence REAL NOT NULL,        -- mode_share — fraction of uses that picked this printing
  sample_size INT NOT NULL,        -- total deck-uses summed across all printings of this oracle
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_moxfield_defaults_scry
  ON moxfield_defaults (default_scryfall_id);
