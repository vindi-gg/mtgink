-- Get top cards by popularity (total art votes) or by print/illustration count
CREATE OR REPLACE FUNCTION get_top_cards(
  p_sort TEXT DEFAULT 'popular',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  type_line TEXT,
  mana_cost TEXT,
  illustration_count INTEGER,
  total_votes BIGINT,
  set_code TEXT,
  collector_number TEXT,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    o.oracle_id,
    o.name,
    o.slug,
    o.type_line,
    o.mana_cost,
    o.illustration_count,
    COALESCE(v.total_votes, 0) AS total_votes,
    rep.set_code,
    rep.collector_number,
    rep.image_version
  FROM oracle_cards o
  LEFT JOIN LATERAL (
    SELECT SUM(ar.vote_count)::BIGINT AS total_votes
    FROM art_ratings ar
    WHERE ar.oracle_id = o.oracle_id
  ) v ON TRUE
  LEFT JOIN LATERAL (
    SELECT p.set_code, p.collector_number, p.image_version
    FROM printings p
    WHERE p.oracle_id = o.oracle_id
      AND p.has_image = TRUE
    ORDER BY p.released_at DESC NULLS LAST
    LIMIT 1
  ) rep ON TRUE
  WHERE o.illustration_count > 1
    AND rep.set_code IS NOT NULL
  ORDER BY
    CASE WHEN p_sort = 'popular' THEN COALESCE(v.total_votes, 0) ELSE 0 END DESC,
    CASE WHEN p_sort = 'prints' THEN o.illustration_count ELSE 0 END DESC,
    o.name ASC
  LIMIT p_limit
  OFFSET p_offset;
$$;
