-- Include illustrations that only exist in digital sets
-- Prefer non-digital printings as representative, fall back to digital

DROP FUNCTION IF EXISTS get_illustrations_for_card(uuid);

CREATE OR REPLACE FUNCTION get_illustrations_for_card(p_oracle_id UUID)
RETURNS TABLE(
  illustration_id UUID,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT,
  image_version TEXT,
  cheapest_price NUMERIC
)
LANGUAGE sql STABLE
AS $func$
  WITH base AS (
    SELECT DISTINCT ON (p.illustration_id)
      p.illustration_id,
      p.artist,
      p.set_code,
      s.name AS set_name,
      p.collector_number,
      p.released_at,
      p.image_version
    FROM printings p
    JOIN sets s ON s.set_code = p.set_code
    WHERE p.oracle_id = p_oracle_id
      AND p.illustration_id IS NOT NULL
      AND p.has_image = TRUE
    ORDER BY p.illustration_id,
      -- Prefer non-digital sets
      s.digital ASC,
      CASE s.set_type
        WHEN 'expansion' THEN 1
        WHEN 'core' THEN 2
        WHEN 'masters' THEN 3
        WHEN 'draft_innovation' THEN 4
        WHEN 'commander' THEN 5
        ELSE 6
      END,
      p.released_at DESC
  ),
  prices AS (
    SELECT p2.illustration_id, MIN(bp.market_price) AS cheapest_price
    FROM printings p2
    JOIN best_prices bp ON bp.scryfall_id = p2.scryfall_id
    WHERE p2.oracle_id = p_oracle_id
      AND bp.market_price IS NOT NULL
    GROUP BY p2.illustration_id
  )
  SELECT b.illustration_id, b.artist, b.set_code, b.set_name,
    b.collector_number, b.released_at, b.image_version,
    pr.cheapest_price
  FROM base b
  LEFT JOIN prices pr ON pr.illustration_id = b.illustration_id;
$func$;
