-- Add image data to search results for visual search
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
  matched_flavor_name TEXT,
  set_code TEXT,
  collector_number TEXT,
  image_version TEXT,
  illustration_count INTEGER
) LANGUAGE sql STABLE AS $$
  WITH matches AS (
    SELECT
      o.oracle_id,
      o.name,
      o.slug,
      o.layout,
      o.type_line,
      o.mana_cost,
      o.colors,
      o.cmc,
      o.illustration_count,
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
    LIMIT p_limit
  )
  SELECT
    m.oracle_id, m.name, m.slug, m.layout, m.type_line, m.mana_cost,
    m.colors, m.cmc, m.matched_flavor_name,
    p.set_code, p.collector_number, p.image_version,
    m.illustration_count
  FROM matches m
  LEFT JOIN LATERAL (
    SELECT p2.set_code, p2.collector_number, p2.image_version
    FROM printings p2
    JOIN sets s ON s.set_code = p2.set_code
    WHERE p2.oracle_id = m.oracle_id
      AND p2.illustration_id IS NOT NULL
      AND p2.has_image = TRUE
    ORDER BY s.digital ASC,
      CASE s.set_type
        WHEN 'expansion' THEN 1 WHEN 'core' THEN 2 WHEN 'masters' THEN 3
        WHEN 'draft_innovation' THEN 4 WHEN 'commander' THEN 5 ELSE 6
      END,
      p2.released_at DESC
    LIMIT 1
  ) p ON true;
$$;
