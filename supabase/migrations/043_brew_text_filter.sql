-- Add rules_text filter to brews for oracle text search
ALTER TABLE brews ADD COLUMN rules_text TEXT;

-- Add oracle_text index for ILIKE searches (requires pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_oracle_cards_oracle_text_trgm ON oracle_cards USING gin (oracle_text gin_trgm_ops);

-- Update get_random_cards to support oracle text filtering
CREATE OR REPLACE FUNCTION get_random_cards(
  p_count INTEGER DEFAULT 1,
  p_min_illustrations INTEGER DEFAULT 2,
  p_colors TEXT[] DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_subtype TEXT DEFAULT NULL,
  p_set_code TEXT DEFAULT NULL,
  p_rules_text TEXT DEFAULT NULL
)
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  layout TEXT,
  type_line TEXT,
  mana_cost TEXT,
  colors JSONB,
  cmc REAL
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  -- Fast path: no filters
  IF p_colors IS NULL AND p_type IS NULL AND p_subtype IS NULL AND p_set_code IS NULL AND p_rules_text IS NULL THEN
    RETURN QUERY
      SELECT o.oracle_id, o.name, o.slug, o.layout, o.type_line, o.mana_cost, o.colors, o.cmc
      FROM oracle_cards o
      WHERE o.illustration_count >= p_min_illustrations
        AND o.digital_only = FALSE
      ORDER BY RANDOM()
      LIMIT p_count;
    RETURN;
  END IF;

  -- Filtered path
  RETURN QUERY
    SELECT o.oracle_id, o.name, o.slug, o.layout, o.type_line, o.mana_cost, o.colors, o.cmc
    FROM oracle_cards o
    WHERE
      o.illustration_count >= p_min_illustrations
      AND o.digital_only = FALSE
      AND (
        p_colors IS NULL OR array_length(p_colors, 1) IS NULL
        OR (
          (p_colors = ARRAY['C'] AND (o.colors IS NULL OR o.colors = '[]'::jsonb))
          OR (
            p_colors != ARRAY['C']
            AND o.colors IS NOT NULL AND o.colors != '[]'::jsonb
            AND (SELECT bool_and(o.colors ? c) FROM unnest(array_remove(p_colors, 'C')) AS c)
          )
        )
      )
      AND (p_type IS NULL OR o.type_line ILIKE '%' || p_type || '%')
      AND (p_subtype IS NULL OR (
        o.type_line LIKE '%—%'
        AND split_part(o.type_line, '—', 2) ILIKE '%' || p_subtype || '%'
      ))
      AND (p_set_code IS NULL OR EXISTS (
        SELECT 1 FROM printings p WHERE p.oracle_id = o.oracle_id AND p.set_code = p_set_code
      ))
      AND (p_rules_text IS NULL OR o.oracle_text ILIKE '%' || p_rules_text || '%')
    ORDER BY RANDOM()
    LIMIT p_count;
END;
$$;
