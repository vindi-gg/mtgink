-- Add flavor_name to printings (alternate card names like Godzilla, FFXVI, Store Championship promos)
ALTER TABLE printings ADD COLUMN IF NOT EXISTS flavor_name TEXT;

-- Create index for flavor_name search
CREATE INDEX IF NOT EXISTS idx_printings_flavor_name ON printings (flavor_name) WHERE flavor_name IS NOT NULL;

-- Update search to also match flavor names on printings
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
  WHERE (
    o.name ILIKE '%' || p_query || '%'
    OR EXISTS (
      SELECT 1 FROM printings p
      WHERE p.oracle_id = o.oracle_id
        AND p.flavor_name ILIKE '%' || p_query || '%'
    )
  )
    AND o.illustration_count >= 2
    AND o.layout != 'art_series'
  ORDER BY o.name
  LIMIT p_limit;
$$;
