-- Add cheapest_price to tribe browse cards for info overlay
DROP FUNCTION IF EXISTS get_cards_by_tribe(TEXT, INTEGER, INTEGER, TEXT);
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
  total_votes BIGINT,
  cheapest_price NUMERIC
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF p_sort = 'price' THEN
    RETURN QUERY
    SELECT
      t.oracle_id, t.name, t.slug, t.type_line, t.mana_cost,
      t.set_code, t.collector_number, t.image_version,
      COALESCE(SUM(ar.vote_count), 0)::BIGINT AS total_votes,
      MIN(bp.market_price) AS cheapest_price
    FROM tribe_cards_mv t
    LEFT JOIN art_ratings ar ON ar.oracle_id = t.oracle_id
    LEFT JOIN printings p ON p.set_code = t.set_code AND p.collector_number = t.collector_number
    LEFT JOIN best_prices bp ON bp.scryfall_id = p.scryfall_id
    WHERE t.tribe = INITCAP(p_slug)
    GROUP BY t.oracle_id, t.name, t.slug, t.type_line, t.mana_cost,
             t.set_code, t.collector_number, t.image_version
    ORDER BY MAX(COALESCE(bp.market_price, 0)) DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
  ELSIF p_sort = 'popular' THEN
    RETURN QUERY
    SELECT
      t.oracle_id, t.name, t.slug, t.type_line, t.mana_cost,
      t.set_code, t.collector_number, t.image_version,
      COALESCE(SUM(ar.vote_count), 0)::BIGINT AS total_votes,
      MIN(bp.market_price) AS cheapest_price
    FROM tribe_cards_mv t
    LEFT JOIN art_ratings ar ON ar.oracle_id = t.oracle_id
    LEFT JOIN printings p ON p.set_code = t.set_code AND p.collector_number = t.collector_number
    LEFT JOIN best_prices bp ON bp.scryfall_id = p.scryfall_id
    WHERE t.tribe = INITCAP(p_slug)
    GROUP BY t.oracle_id, t.name, t.slug, t.type_line, t.mana_cost,
             t.set_code, t.collector_number, t.image_version
    ORDER BY COALESCE(SUM(ar.vote_count), 0) DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
  ELSE
    RETURN QUERY
    SELECT
      t.oracle_id, t.name, t.slug, t.type_line, t.mana_cost,
      t.set_code, t.collector_number, t.image_version,
      0::BIGINT AS total_votes,
      MIN(bp.market_price) AS cheapest_price
    FROM tribe_cards_mv t
    LEFT JOIN printings p ON p.set_code = t.set_code AND p.collector_number = t.collector_number
    LEFT JOIN best_prices bp ON bp.scryfall_id = p.scryfall_id
    WHERE t.tribe = INITCAP(p_slug)
    GROUP BY t.oracle_id, t.name, t.slug, t.type_line, t.mana_cost,
             t.set_code, t.collector_number, t.image_version
    ORDER BY t.name ASC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;
