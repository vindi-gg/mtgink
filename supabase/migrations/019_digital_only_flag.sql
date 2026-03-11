-- Add digital_only flag to oracle_cards for cheap filtering everywhere.
-- A card is digital-only if ALL its printings are in digital-only sets.

-- 1. Add the column
ALTER TABLE oracle_cards ADD COLUMN IF NOT EXISTS digital_only BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Populate: mark cards where every printing is in a digital set
UPDATE oracle_cards o
SET digital_only = TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM printings p
  JOIN sets s ON s.set_code = p.set_code
  WHERE p.oracle_id = o.oracle_id AND s.digital = FALSE
);

-- Also mark A- (Alchemy rebalanced) cards as digital_only
UPDATE oracle_cards
SET digital_only = TRUE
WHERE name LIKE 'A-%' AND digital_only = FALSE;

-- Also mark art_series as digital_only (shouldn't show anywhere)
UPDATE oracle_cards
SET digital_only = TRUE
WHERE layout = 'art_series' AND digital_only = FALSE;

-- 3. Index for filtering
CREATE INDEX IF NOT EXISTS idx_oracle_cards_digital_only ON oracle_cards(digital_only) WHERE digital_only = FALSE;

-- 4. Update get_random_cards to use the flag (simpler, no EXISTS subquery)
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
  IF p_colors IS NULL AND p_type IS NULL AND p_subtype IS NULL THEN
    RETURN QUERY
      SELECT o.oracle_id, o.name, o.slug, o.layout, o.type_line, o.mana_cost, o.colors, o.cmc
      FROM oracle_cards o
      WHERE o.illustration_count >= p_min_illustrations
        AND o.digital_only = FALSE
      ORDER BY RANDOM()
      LIMIT p_count;
    RETURN;
  END IF;

  IF p_type IS NULL AND p_subtype IS NULL THEN
    RETURN QUERY
      SELECT o.oracle_id, o.name, o.slug, o.layout, o.type_line, o.mana_cost, o.colors, o.cmc
      FROM oracle_cards o
      WHERE o.illustration_count >= p_min_illustrations
        AND o.digital_only = FALSE
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
    ORDER BY RANDOM()
    LIMIT p_count;
END;
$$;

-- 5. Update search to exclude digital-only
DROP FUNCTION IF EXISTS search_cards_with_art(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION search_cards_with_art(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  type_line TEXT,
  illustration_count INTEGER,
  set_code TEXT,
  collector_number TEXT,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    o.oracle_id, o.name, o.slug, o.type_line, o.illustration_count,
    p.set_code, p.collector_number, p.image_version
  FROM oracle_cards o
  JOIN LATERAL (
    SELECT p2.set_code, p2.collector_number, p2.image_version
    FROM printings p2
    WHERE p2.oracle_id = o.oracle_id
    ORDER BY p2.released_at DESC
    LIMIT 1
  ) p ON TRUE
  WHERE o.name ILIKE '%' || p_query || '%'
    AND o.illustration_count >= 1
    AND o.digital_only = FALSE
  ORDER BY
    CASE WHEN o.name ILIKE p_query THEN 0
         WHEN o.name ILIKE p_query || '%' THEN 1
         ELSE 2 END,
    o.name
  LIMIT p_limit;
$$;

-- 6. Update get_card_cache to exclude digital-only
DROP FUNCTION IF EXISTS get_card_cache();
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
  illustration_count INTEGER
) LANGUAGE sql STABLE AS $$
  SELECT
    o.oracle_id, o.name, o.slug, o.layout,
    o.type_line, o.mana_cost, o.colors, o.cmc,
    o.illustration_count
  FROM oracle_cards o
  WHERE o.illustration_count >= 2
    AND o.digital_only = FALSE;
$$;

-- 7. Update get_random_bracket_cards to exclude digital-only
DROP FUNCTION IF EXISTS get_random_bracket_cards(INTEGER);
CREATE OR REPLACE FUNCTION get_random_bracket_cards(p_count INTEGER DEFAULT 32)
RETURNS TABLE (
  illustration_id UUID,
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  elo_rating REAL,
  vote_count INTEGER,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  WITH random_cards AS (
    SELECT o.oracle_id, o.name, o.slug
    FROM oracle_cards o
    WHERE o.illustration_count >= 2
      AND o.digital_only = FALSE
    ORDER BY RANDOM()
    LIMIT p_count
  ),
  illustrations AS (
    SELECT DISTINCT ON (rc.oracle_id)
      p.illustration_id,
      rc.oracle_id,
      rc.name,
      rc.slug,
      p.artist,
      p.set_code,
      s.name AS set_name,
      p.collector_number,
      COALESCE(ar.elo_rating, 1500) AS elo_rating,
      COALESCE(ar.vote_count, 0) AS vote_count,
      p.image_version
    FROM random_cards rc
    JOIN printings p ON p.oracle_id = rc.oracle_id
    JOIN sets s ON s.set_code = p.set_code
    LEFT JOIN art_ratings ar ON ar.illustration_id = p.illustration_id
    WHERE s.digital = FALSE
    ORDER BY rc.oracle_id, RANDOM()
  )
  SELECT * FROM illustrations;
$$;
