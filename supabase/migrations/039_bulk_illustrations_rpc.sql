-- Bulk version of get_illustrations_for_card that accepts multiple oracle_ids
-- Returns one row per unique illustration with cheapest price included
-- Uses JOIN aggregation instead of correlated subquery (52ms vs 47s)

CREATE OR REPLACE FUNCTION get_illustrations_for_cards(p_oracle_ids UUID[])
RETURNS TABLE(
  illustration_id UUID,
  oracle_id UUID,
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
      p.oracle_id,
      p.artist,
      p.set_code,
      s.name AS set_name,
      p.collector_number,
      p.released_at,
      p.image_version
    FROM printings p
    JOIN sets s ON s.set_code = p.set_code
    WHERE p.oracle_id = ANY(p_oracle_ids)
      AND p.illustration_id IS NOT NULL
      AND s.digital = FALSE
      AND p.has_image = TRUE
    ORDER BY p.illustration_id,
      CASE s.set_type
        WHEN 'expansion' THEN 1
        WHEN 'core' THEN 2
        WHEN 'masters' THEN 3
        WHEN 'draft_innovation' THEN 4
        WHEN 'commander' THEN 5
        ELSE 6
      END,
      p.released_at ASC
  ),
  prices AS (
    SELECT p2.illustration_id, MIN(bp.market_price) AS cheapest_price
    FROM printings p2
    JOIN best_prices bp ON bp.scryfall_id = p2.scryfall_id
    WHERE p2.illustration_id IN (SELECT illustration_id FROM base)
      AND bp.market_price IS NOT NULL
    GROUP BY p2.illustration_id
  )
  SELECT b.*, pr.cheapest_price
  FROM base b
  LEFT JOIN prices pr ON pr.illustration_id = b.illustration_id;
$func$;
