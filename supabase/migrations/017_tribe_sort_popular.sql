-- Add popularity and price sorting to tribe card queries.
-- Joins art_ratings for vote counts, best_prices for price sorting.

CREATE OR REPLACE FUNCTION get_cards_by_tribe(
  p_slug TEXT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_sort TEXT DEFAULT 'popular'
)
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  type_line TEXT,
  mana_cost TEXT,
  set_code TEXT,
  collector_number TEXT,
  image_version TEXT,
  total_votes BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT
    t.oracle_id, t.name, t.slug, t.type_line, t.mana_cost,
    t.set_code, t.collector_number, t.image_version,
    COALESCE(SUM(ar.vote_count), 0) AS total_votes
  FROM tribe_cards_mv t
  LEFT JOIN art_ratings ar ON ar.oracle_id = t.oracle_id
  LEFT JOIN printings p ON p.set_code = t.set_code AND p.collector_number = t.collector_number
  LEFT JOIN best_prices bp ON bp.scryfall_id = p.scryfall_id
  WHERE t.tribe = INITCAP(p_slug)
  GROUP BY t.oracle_id, t.name, t.slug, t.type_line, t.mana_cost,
           t.set_code, t.collector_number, t.image_version
  ORDER BY
    CASE WHEN p_sort = 'popular' THEN COALESCE(SUM(ar.vote_count), 0) END DESC NULLS LAST,
    CASE WHEN p_sort = 'price' THEN MAX(COALESCE(bp.market_price, 0)) END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('popular', 'price') THEN t.name END ASC
  LIMIT p_limit
  OFFSET p_offset;
$$;
