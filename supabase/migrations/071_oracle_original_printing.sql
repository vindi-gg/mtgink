-- Materialize "is this printing a reprint?" so we can filter without joins.
--
-- oracle_cards.original_set_code / original_released_at = the earliest non-digital
-- printing of this card. Useful for "First seen in X" display.
--
-- printings.is_reprint = true iff this printing is NOT from the card's original set.
-- Equality filter on printings, no join needed.

ALTER TABLE oracle_cards ADD COLUMN IF NOT EXISTS original_set_code TEXT;
ALTER TABLE oracle_cards ADD COLUMN IF NOT EXISTS original_released_at TEXT;
ALTER TABLE printings    ADD COLUMN IF NOT EXISTS is_reprint BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_oracle_cards_original_set ON oracle_cards(original_set_code);
CREATE INDEX IF NOT EXISTS idx_printings_set_reprint ON printings(set_code, is_reprint);

-- Backfill: for each oracle_card, pick the earliest non-digital printing
WITH firsts AS (
  SELECT DISTINCT ON (p.oracle_id)
    p.oracle_id,
    p.set_code,
    s.released_at
  FROM printings p
  JOIN sets s ON s.set_code = p.set_code
  WHERE s.digital = FALSE
  ORDER BY p.oracle_id, s.released_at ASC, p.set_code ASC
)
UPDATE oracle_cards o
SET original_set_code = f.set_code,
    original_released_at = f.released_at
FROM firsts f
WHERE f.oracle_id = o.oracle_id;

-- Mark reprints on printings (any printing whose set != the card's original set)
UPDATE printings p
SET is_reprint = TRUE
FROM oracle_cards o
WHERE o.oracle_id = p.oracle_id
  AND o.original_set_code IS NOT NULL
  AND p.set_code != o.original_set_code;

-- Helper RPC: refresh original_set_code + is_reprint for cards in a given set.
-- Call after importing or updating a set. Because a new set's release can flip
-- cards in OTHER sets from "original" to "reprint", we recompute for the full
-- set of affected oracle_ids.
CREATE OR REPLACE FUNCTION refresh_reprint_flags_for_set(p_set_code TEXT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_oracle_ids UUID[];
BEGIN
  SELECT ARRAY(SELECT DISTINCT oracle_id FROM printings WHERE set_code = p_set_code)
  INTO v_oracle_ids;

  IF v_oracle_ids IS NULL OR array_length(v_oracle_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Update oracle_cards.original_* for these cards
  WITH firsts AS (
    SELECT DISTINCT ON (p.oracle_id)
      p.oracle_id,
      p.set_code,
      s.released_at
    FROM printings p
    JOIN sets s ON s.set_code = p.set_code
    WHERE p.oracle_id = ANY(v_oracle_ids)
      AND s.digital = FALSE
    ORDER BY p.oracle_id, s.released_at ASC, p.set_code ASC
  )
  UPDATE oracle_cards o
  SET original_set_code = f.set_code,
      original_released_at = f.released_at
  FROM firsts f
  WHERE f.oracle_id = o.oracle_id;

  -- Reset + remark is_reprint on every printing of these cards
  UPDATE printings p
  SET is_reprint = (p.set_code != o.original_set_code)
  FROM oracle_cards o
  WHERE o.oracle_id = p.oracle_id
    AND p.oracle_id = ANY(v_oracle_ids)
    AND o.original_set_code IS NOT NULL;
END;
$$;
