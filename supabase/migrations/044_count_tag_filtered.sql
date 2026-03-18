-- Filtered count for cards matching a tag + optional filters
CREATE OR REPLACE FUNCTION count_cards_by_tag_filtered(
  p_tag_id TEXT,
  p_colors TEXT[] DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_subtype TEXT DEFAULT NULL,
  p_rules_text TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $func$
  SELECT COUNT(DISTINCT o.oracle_id)::INTEGER
  FROM (
    SELECT ot.oracle_id FROM oracle_tags ot WHERE ot.tag_id = p_tag_id
    UNION
    SELECT DISTINCT p.oracle_id
    FROM illustration_tags it
    JOIN printings p ON p.illustration_id = it.illustration_id
    WHERE it.tag_id = p_tag_id
  ) t
  JOIN oracle_cards o ON o.oracle_id = t.oracle_id
  WHERE o.layout != 'art_series'
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
    AND (p_rules_text IS NULL OR o.oracle_text ILIKE '%' || p_rules_text || '%');
$func$;
