-- Stored procedures for browsing creature tribes and Scryfall tags

-- 1. Get all creature subtypes with card counts
CREATE OR REPLACE FUNCTION get_creature_tribes()
RETURNS TABLE (tribe TEXT, card_count BIGINT) LANGUAGE sql STABLE AS $$
  WITH faces AS (
    SELECT oracle_id, trim(unnest(string_to_array(type_line, '//'))) AS face_type
    FROM oracle_cards
    WHERE type_line LIKE '%Creature%'
      AND type_line LIKE '%—%'
      AND layout != 'art_series'
  ),
  subtypes AS (
    SELECT oracle_id, trim(unnest(string_to_array(trim(split_part(face_type, '—', 2)), ' '))) AS subtype
    FROM faces
    WHERE face_type LIKE '%Creature%' AND face_type LIKE '%—%'
  )
  SELECT subtype AS tribe, COUNT(DISTINCT oracle_id) AS card_count
  FROM subtypes
  WHERE subtype != ''
  GROUP BY subtype
  ORDER BY card_count DESC;
$$;

-- 2. Get cards by creature tribe with representative printing
CREATE OR REPLACE FUNCTION get_cards_by_tribe(p_tribe TEXT)
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
  WITH matching_cards AS (
    SELECT DISTINCT o.oracle_id
    FROM oracle_cards o,
    LATERAL unnest(string_to_array(o.type_line, '//')) AS face(face_type)
    WHERE face_type LIKE '%Creature%'
      AND face_type LIKE '%—%'
      AND p_tribe = ANY(string_to_array(trim(split_part(face_type, '—', 2)), ' '))
      AND o.layout != 'art_series'
  )
  SELECT DISTINCT ON (o.oracle_id)
    o.oracle_id, o.name, o.slug, o.type_line, o.mana_cost,
    p.set_code, p.collector_number, p.image_version
  FROM matching_cards mc
  JOIN oracle_cards o ON o.oracle_id = mc.oracle_id
  JOIN printings p ON p.oracle_id = o.oracle_id AND p.illustration_id IS NOT NULL
  JOIN sets s ON s.set_code = p.set_code
  ORDER BY o.oracle_id,
    CASE s.set_type
      WHEN 'expansion' THEN 1 WHEN 'core' THEN 2 WHEN 'masters' THEN 3
      WHEN 'draft_innovation' THEN 4 WHEN 'commander' THEN 5 ELSE 6
    END,
    p.released_at DESC;
$$;

-- 3. Add usage_count to tags for fast browsing
ALTER TABLE tags ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;

UPDATE tags t SET usage_count = (
  SELECT COUNT(*) FROM illustration_tags it WHERE it.tag_id = t.tag_id
) + (
  SELECT COUNT(*) FROM oracle_tags ot WHERE ot.tag_id = t.tag_id
);

CREATE INDEX IF NOT EXISTS idx_tags_usage_count ON tags(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_tags_label_trgm ON tags USING gin(label gin_trgm_ops);

-- 4. Get cards by tag (handles both illustration and oracle tags)
CREATE OR REPLACE FUNCTION get_cards_by_tag(p_tag_id TEXT)
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
  WITH tagged_oracle_ids AS (
    SELECT oracle_id FROM oracle_tags WHERE tag_id = p_tag_id
    UNION
    SELECT DISTINCT p.oracle_id
    FROM illustration_tags it
    JOIN printings p ON p.illustration_id = it.illustration_id
    WHERE it.tag_id = p_tag_id
  )
  SELECT DISTINCT ON (o.oracle_id)
    o.oracle_id, o.name, o.slug, o.type_line, o.mana_cost,
    p.set_code, p.collector_number, p.image_version
  FROM tagged_oracle_ids t
  JOIN oracle_cards o ON o.oracle_id = t.oracle_id
  JOIN printings p ON p.oracle_id = o.oracle_id AND p.illustration_id IS NOT NULL
  JOIN sets s ON s.set_code = p.set_code
  WHERE o.layout != 'art_series'
  ORDER BY o.oracle_id,
    CASE s.set_type
      WHEN 'expansion' THEN 1 WHEN 'core' THEN 2 WHEN 'masters' THEN 3
      WHEN 'draft_innovation' THEN 4 WHEN 'commander' THEN 5 ELSE 6
    END,
    p.released_at DESC;
$$;
