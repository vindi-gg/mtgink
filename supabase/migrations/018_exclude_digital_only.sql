-- Exclude digital-only and art_series cards from random card selection.
-- Matches the filtering logic used in tribe_cards_mv (migration 014).

CREATE OR REPLACE FUNCTION get_random_cards(
  p_count INTEGER DEFAULT 1,
  p_min_illustrations INTEGER DEFAULT 2,
  p_colors TEXT[] DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_subtype TEXT DEFAULT NULL
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
  -- Fast path: no filters (most common case)
  IF p_colors IS NULL AND p_type IS NULL AND p_subtype IS NULL THEN
    RETURN QUERY
      SELECT o.oracle_id, o.name, o.slug, o.layout, o.type_line, o.mana_cost, o.colors, o.cmc
      FROM oracle_cards o
      WHERE o.illustration_count >= p_min_illustrations
        AND o.layout != 'art_series'
        AND o.name NOT LIKE 'A-%'
        AND EXISTS (
          SELECT 1 FROM printings p
          JOIN sets s ON s.set_code = p.set_code
          WHERE p.oracle_id = o.oracle_id AND s.digital = FALSE
        )
      ORDER BY RANDOM()
      LIMIT p_count;
    RETURN;
  END IF;

  -- Color-only filter
  IF p_type IS NULL AND p_subtype IS NULL THEN
    RETURN QUERY
      SELECT o.oracle_id, o.name, o.slug, o.layout, o.type_line, o.mana_cost, o.colors, o.cmc
      FROM oracle_cards o
      WHERE o.illustration_count >= p_min_illustrations
        AND o.layout != 'art_series'
        AND o.name NOT LIKE 'A-%'
        AND EXISTS (
          SELECT 1 FROM printings p
          JOIN sets s ON s.set_code = p.set_code
          WHERE p.oracle_id = o.oracle_id AND s.digital = FALSE
        )
        AND (
          (p_colors = ARRAY['C'] AND (o.colors IS NULL OR o.colors = '[]'::jsonb))
          OR (
            p_colors != ARRAY['C']
            AND o.colors IS NOT NULL AND o.colors != '[]'::jsonb
            AND (SELECT bool_and(o.colors ? c) FROM unnest(array_remove(p_colors, 'C')) AS c)
          )
        )
      ORDER BY RANDOM()
      LIMIT p_count;
    RETURN;
  END IF;

  -- Full filter path
  RETURN QUERY
    SELECT o.oracle_id, o.name, o.slug, o.layout, o.type_line, o.mana_cost, o.colors, o.cmc
    FROM oracle_cards o
    WHERE
      o.illustration_count >= p_min_illustrations
      AND o.layout != 'art_series'
      AND o.name NOT LIKE 'A-%'
      AND EXISTS (
        SELECT 1 FROM printings p
        JOIN sets s ON s.set_code = p.set_code
        WHERE p.oracle_id = o.oracle_id AND s.digital = FALSE
      )
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
    ORDER BY RANDOM()
    LIMIT p_count;
END;
$$;
