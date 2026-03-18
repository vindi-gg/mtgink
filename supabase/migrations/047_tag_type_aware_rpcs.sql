-- Optimize get_cards_by_tag: accept tag type to skip unnecessary UNION branch
DROP FUNCTION IF EXISTS get_cards_by_tag(TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION get_cards_by_tag(p_tag_id TEXT, p_limit INTEGER DEFAULT 60, p_offset INTEGER DEFAULT 0, p_tag_type TEXT DEFAULT NULL)
RETURNS TABLE(oracle_id UUID, name TEXT, slug TEXT, type_line TEXT, mana_cost TEXT, set_code TEXT, collector_number TEXT, image_version TEXT)
LANGUAGE sql STABLE
AS $func$
  WITH tagged_oracle_ids AS (
    -- Oracle tags branch (skip if p_tag_type = 'illustration')
    SELECT ot.oracle_id FROM oracle_tags ot
    WHERE ot.tag_id = p_tag_id AND (p_tag_type IS NULL OR p_tag_type = 'oracle')
    UNION
    -- Illustration tags branch (skip if p_tag_type = 'oracle')
    SELECT DISTINCT p.oracle_id
    FROM illustration_tags it
    JOIN printings p ON p.illustration_id = it.illustration_id
    WHERE it.tag_id = p_tag_id AND (p_tag_type IS NULL OR p_tag_type = 'illustration')
  )
  SELECT DISTINCT ON (o.oracle_id)
    o.oracle_id, o.name, o.slug, o.type_line, o.mana_cost,
    p.set_code, p.collector_number, p.image_version
  FROM tagged_oracle_ids t
  JOIN oracle_cards o ON o.oracle_id = t.oracle_id
  JOIN printings p ON p.oracle_id = o.oracle_id AND p.illustration_id IS NOT NULL
  JOIN sets s ON s.set_code = p.set_code
  WHERE o.layout != 'art_series' AND s.digital = FALSE
  ORDER BY o.oracle_id,
    CASE s.set_type
      WHEN 'expansion' THEN 1 WHEN 'core' THEN 2 WHEN 'masters' THEN 3
      WHEN 'draft_innovation' THEN 4 WHEN 'commander' THEN 5 ELSE 6
    END,
    p.released_at DESC
  LIMIT p_limit OFFSET p_offset;
$func$;

-- Optimize count_cards_by_tag: accept tag type
DROP FUNCTION IF EXISTS count_cards_by_tag(TEXT);
CREATE OR REPLACE FUNCTION count_cards_by_tag(p_tag_id TEXT, p_tag_type TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $func$
  SELECT COUNT(DISTINCT o.oracle_id)::INTEGER
  FROM (
    SELECT ot.oracle_id FROM oracle_tags ot
    WHERE ot.tag_id = p_tag_id AND (p_tag_type IS NULL OR p_tag_type = 'oracle')
    UNION
    SELECT DISTINCT p.oracle_id
    FROM illustration_tags it
    JOIN printings p ON p.illustration_id = it.illustration_id
    WHERE it.tag_id = p_tag_id AND (p_tag_type IS NULL OR p_tag_type = 'illustration')
  ) t
  JOIN oracle_cards o ON o.oracle_id = t.oracle_id
  WHERE o.layout != 'art_series';
$func$;
