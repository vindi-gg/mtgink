-- Materialized view for tribe-to-card mapping with representative printings.
-- Replaces the expensive get_cards_by_tribe / get_creature_tribes functions
-- with simple lookups against pre-computed data.
-- Excludes: art_series layout, Alchemy rebalanced (A-) cards, digital-only cards.

-- 1. Materialized view: tribe_cards_mv
CREATE MATERIALIZED VIEW tribe_cards_mv AS
WITH faces AS (
  SELECT
    o.oracle_id, o.name, o.slug, o.type_line, o.mana_cost,
    trim(unnest(string_to_array(o.type_line, '//'))) AS face_type
  FROM oracle_cards o
  WHERE o.type_line LIKE '%Creature%'
    AND o.type_line LIKE '%—%'
    AND o.layout != 'art_series'
    AND o.name NOT LIKE 'A-%'
    AND EXISTS (
      SELECT 1 FROM printings p
      JOIN sets s ON s.set_code = p.set_code
      WHERE p.oracle_id = o.oracle_id AND s.digital = FALSE
    )
),
subtypes AS (
  SELECT
    f.oracle_id, f.name, f.slug, f.type_line, f.mana_cost,
    trim(unnest(string_to_array(trim(split_part(f.face_type, '—', 2)), ' '))) AS tribe
  FROM faces f
  WHERE f.face_type LIKE '%Creature%'
    AND f.face_type LIKE '%—%'
),
with_printings AS (
  SELECT DISTINCT ON (st.tribe, st.oracle_id)
    st.tribe,
    st.oracle_id,
    st.name,
    st.slug,
    st.type_line,
    st.mana_cost,
    p.set_code,
    p.collector_number,
    p.image_version
  FROM subtypes st
  JOIN printings p ON p.oracle_id = st.oracle_id AND p.illustration_id IS NOT NULL
  JOIN sets s ON s.set_code = p.set_code
  WHERE st.tribe != ''
    AND s.digital = FALSE
  ORDER BY st.tribe, st.oracle_id,
    CASE s.set_type
      WHEN 'expansion' THEN 1
      WHEN 'core' THEN 2
      WHEN 'masters' THEN 3
      WHEN 'draft_innovation' THEN 4
      WHEN 'commander' THEN 5
      ELSE 6
    END,
    p.released_at DESC
)
SELECT * FROM with_printings;

-- 2. Indexes
CREATE INDEX idx_tribe_cards_tribe ON tribe_cards_mv (tribe);
CREATE INDEX idx_tribe_cards_tribe_name ON tribe_cards_mv (tribe, name);
CREATE UNIQUE INDEX idx_tribe_cards_tribe_oracle ON tribe_cards_mv (tribe, oracle_id);

-- 3. Replace get_cards_by_tribe to query from materialized view
CREATE OR REPLACE FUNCTION get_cards_by_tribe(p_slug TEXT, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  type_line TEXT,
  mana_cost TEXT,
  set_code TEXT,
  collector_number TEXT,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    t.oracle_id, t.name, t.slug, t.type_line, t.mana_cost,
    t.set_code, t.collector_number, t.image_version
  FROM tribe_cards_mv t
  WHERE t.tribe = INITCAP(p_slug)
  ORDER BY t.name ASC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- 4. Count function for pagination
CREATE OR REPLACE FUNCTION count_cards_by_tribe(p_slug TEXT)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)
  FROM tribe_cards_mv
  WHERE tribe = INITCAP(p_slug);
$$;

-- 5. Replace get_creature_tribes to use materialized view
CREATE OR REPLACE FUNCTION get_creature_tribes()
RETURNS TABLE (tribe TEXT, slug TEXT, card_count BIGINT) LANGUAGE sql STABLE AS $$
  SELECT
    t.tribe,
    LOWER(t.tribe) AS slug,
    COUNT(*) AS card_count
  FROM tribe_cards_mv t
  GROUP BY t.tribe
  ORDER BY card_count DESC;
$$;
