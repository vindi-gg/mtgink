-- Phase 3: detect Moxfield's default printing per oracle_id by finding
-- the mode (most-common) printing across our scraped commander decks.
-- This is the empirical fallback to API-supplied defaults — robust and
-- self-improving as more decks are scraped.
--
-- Confidence is the mode's share of total uses for that oracle. Above
-- ~0.4 = clear default; below = no clear default (user picks vary
-- widely, or the card has no popular reprint to default to). The
-- aggregator only filters out default uses when confidence is sufficient.

BEGIN;

WITH per_oracle AS (
  SELECT p.oracle_id, mdc.scryfall_id,
         COUNT(DISTINCT mdc.deck_id) AS uses
  FROM moxfield_deck_cards mdc
  JOIN printings p ON p.scryfall_id = mdc.scryfall_id
  JOIN moxfield_decks md ON md.deck_id = mdc.deck_id
  WHERE md.format = 'commander'
  GROUP BY p.oracle_id, mdc.scryfall_id
),
totals AS (
  SELECT oracle_id, SUM(uses) AS total_uses
  FROM per_oracle
  GROUP BY oracle_id
),
mode_picks AS (
  SELECT DISTINCT ON (po.oracle_id)
    po.oracle_id,
    po.scryfall_id  AS default_scryfall_id,
    po.uses         AS mode_uses,
    t.total_uses
  FROM per_oracle po
  JOIN totals t ON t.oracle_id = po.oracle_id
  ORDER BY po.oracle_id, po.uses DESC, po.scryfall_id  -- deterministic on ties
)
INSERT INTO moxfield_defaults (oracle_id, default_scryfall_id, source, confidence, sample_size)
SELECT
  oracle_id,
  default_scryfall_id,
  'inferred' AS source,
  (mode_uses::REAL / total_uses::REAL) AS confidence,
  total_uses::INT
FROM mode_picks
WHERE total_uses >= 5  -- need enough samples to trust a mode
ON CONFLICT (oracle_id) DO UPDATE SET
  default_scryfall_id = EXCLUDED.default_scryfall_id,
  source = EXCLUDED.source,
  confidence = EXCLUDED.confidence,
  sample_size = EXCLUDED.sample_size,
  computed_at = NOW();

COMMIT;

SELECT
  COUNT(*) AS oracles_with_default,
  ROUND(AVG(confidence)::NUMERIC, 3) AS avg_confidence,
  ROUND(AVG(sample_size)::NUMERIC, 1) AS avg_samples,
  COUNT(*) FILTER (WHERE confidence >= 0.4) AS clear_defaults,
  COUNT(*) FILTER (WHERE confidence >= 0.6) AS strong_defaults
FROM moxfield_defaults;
