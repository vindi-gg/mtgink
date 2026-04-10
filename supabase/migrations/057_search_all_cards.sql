-- Remove illustration_count filter so search returns all cards
DROP FUNCTION IF EXISTS search_cards_with_art(TEXT, INTEGER);

CREATE FUNCTION search_cards_with_art(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  layout TEXT,
  type_line TEXT,
  mana_cost TEXT,
  colors JSONB,
  cmc REAL,
  matched_flavor_name TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    o.oracle_id,
    o.name,
    o.slug,
    o.layout,
    o.type_line,
    o.mana_cost,
    o.colors,
    o.cmc,
    (
      SELECT p.flavor_name FROM printings p
      WHERE p.oracle_id = o.oracle_id
        AND p.flavor_name ILIKE '%' || p_query || '%'
      LIMIT 1
    ) AS matched_flavor_name
  FROM oracle_cards o
  WHERE (
    o.name ILIKE '%' || p_query || '%'
    OR EXISTS (
      SELECT 1 FROM printings p
      WHERE p.oracle_id = o.oracle_id
        AND p.flavor_name ILIKE '%' || p_query || '%'
    )
  )
    AND o.layout != 'art_series'
  ORDER BY o.name
  LIMIT p_limit;
$$;
