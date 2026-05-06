-- Aggregate Moxfield Commander deck usage into popularity_signals.
--
-- Three illustration-level signals are stored, for the homepage Popular
-- sort to choose from depending on noise tolerance:
--
--   commander_total_30d   raw card-copy count (lands inflated; basic-land
--                         doubling/tripling spikes results)
--   commander_unique_30d  distinct decks using this illustration (lands
--                         deflated to per-deck unique, but still includes
--                         Moxfield's auto-default printings)
--   commander_chosen_30d  distinct decks where the user *deliberately*
--                         picked this printing — i.e. it isn't the
--                         oracle's default per moxfield_defaults. This is
--                         the signal that captures real art preference.

BEGIN;

-- 1) Total card-copies per illustration in last 30d
WITH cutoff AS (SELECT (NOW() - INTERVAL '30 days') AS t),
usage AS (
  SELECT p.illustration_id, SUM(mdc.quantity) AS copies
  FROM moxfield_deck_cards mdc
  JOIN moxfield_decks md ON md.deck_id = mdc.deck_id
  JOIN printings p       ON p.scryfall_id = mdc.scryfall_id
  CROSS JOIN cutoff
  WHERE md.last_updated_at >= cutoff.t
    AND md.format = 'commander'
    AND p.illustration_id IS NOT NULL
  GROUP BY p.illustration_id
)
INSERT INTO popularity_signals (illustration_id, source, signal_type, value)
SELECT illustration_id, 'moxfield', 'commander_total_30d', copies
FROM usage WHERE copies > 0
ON CONFLICT (illustration_id, source, signal_type)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- 2) Unique decks per illustration in last 30d (deck-level dedupe)
WITH cutoff AS (SELECT (NOW() - INTERVAL '30 days') AS t),
usage AS (
  SELECT p.illustration_id, COUNT(DISTINCT mdc.deck_id) AS decks
  FROM moxfield_deck_cards mdc
  JOIN moxfield_decks md ON md.deck_id = mdc.deck_id
  JOIN printings p       ON p.scryfall_id = mdc.scryfall_id
  CROSS JOIN cutoff
  WHERE md.last_updated_at >= cutoff.t
    AND md.format = 'commander'
    AND p.illustration_id IS NOT NULL
  GROUP BY p.illustration_id
)
INSERT INTO popularity_signals (illustration_id, source, signal_type, value)
SELECT illustration_id, 'moxfield', 'commander_unique_30d', decks
FROM usage WHERE decks > 0
ON CONFLICT (illustration_id, source, signal_type)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- 3) Chosen-only: filter at the ART level — credit only illustrations whose
--    users picked an *art* different from the oracle's default art. This is
--    stricter than filtering by printing scryfall_id, which over-credits
--    every non-default reprint of the SAME illustration. The default art is
--    the illustration_id of moxfield_defaults.default_scryfall_id. Cards
--    without a confident default (no row OR confidence<0.4) fall through
--    to crediting all uses — we can't filter what we can't identify.

-- Wipe stale rows first so illustrations whose chosen count is now 0 don't
-- linger from a previous run. ON CONFLICT in the upsert below would only
-- update rows that have a new value — it can't write zero.
DELETE FROM popularity_signals
 WHERE source='moxfield' AND signal_type='commander_chosen_30d';

WITH cutoff AS (SELECT (NOW() - INTERVAL '30 days') AS t),
default_arts AS (
  SELECT d.oracle_id, p.illustration_id AS default_illustration_id, d.confidence
  FROM moxfield_defaults d
  JOIN printings p ON p.scryfall_id = d.default_scryfall_id
),
deck_uses AS (
  SELECT
    p.illustration_id,
    p.oracle_id,
    COUNT(DISTINCT mdc.deck_id) AS decks
  FROM moxfield_deck_cards mdc
  JOIN moxfield_decks md ON md.deck_id = mdc.deck_id
  JOIN printings p       ON p.scryfall_id = mdc.scryfall_id
  CROSS JOIN cutoff
  WHERE md.last_updated_at >= cutoff.t
    AND md.format = 'commander'
    AND p.illustration_id IS NOT NULL
  GROUP BY p.illustration_id, p.oracle_id
),
chosen AS (
  SELECT
    u.illustration_id,
    SUM(
      CASE
        WHEN da.default_illustration_id IS NULL THEN u.decks  -- no default known: count
        WHEN da.confidence < 0.4 THEN u.decks                  -- weak default: don't filter
        WHEN u.illustration_id <> da.default_illustration_id   -- this art is NOT the default art: count
          THEN u.decks
        ELSE 0                                                  -- this IS the default art: skip
      END
    ) AS chosen_decks
  FROM deck_uses u
  LEFT JOIN default_arts da ON da.oracle_id = u.oracle_id
  GROUP BY u.illustration_id
)
INSERT INTO popularity_signals (illustration_id, source, signal_type, value)
SELECT illustration_id, 'moxfield', 'commander_chosen_30d', chosen_decks
FROM chosen WHERE chosen_decks > 0
ON CONFLICT (illustration_id, source, signal_type)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

COMMIT;

-- Sanity dump
SELECT signal_type, COUNT(*) AS illustrations, SUM(value)::BIGINT AS total
FROM popularity_signals WHERE source='moxfield'
GROUP BY signal_type
ORDER BY signal_type;
