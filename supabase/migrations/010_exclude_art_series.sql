-- Exclude art_series layout from search and card cache (they're booster art cards, not playable)

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
    AND o.illustration_count >= 2
    AND o.layout != 'art_series'
  ORDER BY o.name
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION get_card_cache()
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  layout TEXT,
  type_line TEXT,
  mana_cost TEXT,
  colors JSONB,
  cmc REAL,
  illustration_count BIGINT
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
    o.illustration_count::BIGINT
  FROM oracle_cards o
  WHERE o.illustration_count >= 1
    AND o.layout != 'art_series';
$$;
