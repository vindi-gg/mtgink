-- Direct search for cards with 2+ illustrations (avoids loading entire card cache)
CREATE OR REPLACE FUNCTION search_cards_with_art(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  layout TEXT,
  type_line TEXT,
  mana_cost TEXT,
  colors JSONB,
  cmc REAL
) LANGUAGE sql STABLE AS $$
  SELECT
    o.oracle_id,
    o.name,
    o.slug,
    o.layout,
    o.type_line,
    o.mana_cost,
    o.colors,
    o.cmc
  FROM oracle_cards o
  WHERE o.name ILIKE '%' || p_query || '%'
    AND (
      SELECT COUNT(DISTINCT p.illustration_id)
      FROM printings p
      WHERE p.oracle_id = o.oracle_id
        AND p.illustration_id IS NOT NULL
    ) >= 2
  ORDER BY o.name
  LIMIT p_limit;
$$;
