-- Cross-set companion to get_illustrations_for_set: powers the homepage
-- "all art" listing. Same row shape so the API and listing component can
-- be shared. Sortable by popularity (ELO desc), A-Z (card name asc),
-- price (most expensive first), or latest (released_at desc, with a
-- natural-number-aware collector_number tiebreaker for in-set order).

CREATE OR REPLACE FUNCTION get_top_illustrations(
  p_sort TEXT DEFAULT 'popularity',
  p_limit INT DEFAULT 30,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  illustration_id UUID,
  oracle_id UUID,
  card_name TEXT,
  card_slug TEXT,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT,
  image_version TEXT,
  elo_rating REAL,
  vote_count INTEGER,
  cheapest_price NUMERIC,
  total_count BIGINT
)
LANGUAGE sql STABLE
AS $func$
  WITH base AS (
    SELECT DISTINCT ON (p.illustration_id)
      p.illustration_id,
      p.oracle_id,
      o.name AS card_name,
      o.slug AS card_slug,
      p.artist,
      p.set_code,
      s.name AS set_name,
      p.collector_number,
      p.released_at,
      p.image_version
    FROM printings p
    JOIN sets s ON s.set_code = p.set_code
    JOIN oracle_cards o ON o.oracle_id = p.oracle_id
    WHERE p.illustration_id IS NOT NULL
      AND p.has_image = TRUE
      AND s.digital = FALSE
      AND s.set_type NOT IN ('token', 'memorabilia', 'art_series')
    ORDER BY p.illustration_id,
      CASE s.set_type
        WHEN 'expansion' THEN 1
        WHEN 'core' THEN 2
        WHEN 'masters' THEN 3
        WHEN 'draft_innovation' THEN 4
        WHEN 'commander' THEN 5
        WHEN 'masterpiece' THEN 6
        ELSE 7
      END,
      p.released_at DESC NULLS LAST
  ),
  enriched AS (
    SELECT b.*,
      COALESCE(ar.elo_rating, 1500)::REAL AS elo_rating,
      COALESCE(ar.vote_count, 0)::INTEGER AS vote_count
    FROM base b
    LEFT JOIN art_ratings ar ON ar.illustration_id = b.illustration_id
  ),
  prices AS (
    SELECT p2.illustration_id, MIN(bp.market_price) AS cheapest_price
    FROM printings p2
    JOIN best_prices bp ON bp.scryfall_id = p2.scryfall_id
    WHERE p2.illustration_id IN (SELECT illustration_id FROM enriched)
      AND bp.market_price IS NOT NULL
    GROUP BY p2.illustration_id
  ),
  combined AS (
    SELECT e.*, pr.cheapest_price,
      COUNT(*) OVER () AS total_count
    FROM enriched e
    LEFT JOIN prices pr ON pr.illustration_id = e.illustration_id
  )
  SELECT
    illustration_id, oracle_id, card_name, card_slug, artist,
    set_code, set_name, collector_number, released_at, image_version,
    elo_rating, vote_count, cheapest_price, total_count
  FROM combined
  ORDER BY
    CASE WHEN p_sort = 'popularity' THEN elo_rating END DESC NULLS LAST,
    CASE WHEN p_sort = 'az' THEN card_name END ASC NULLS LAST,
    CASE WHEN p_sort = 'price' THEN cheapest_price END DESC NULLS LAST,
    CASE WHEN p_sort = 'latest' THEN released_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'latest'
      THEN COALESCE((REGEXP_MATCH(collector_number, '^([0-9]+)'))[1]::INT, 0)
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'latest' THEN collector_number END DESC NULLS LAST,
    card_name ASC,
    illustration_id
  LIMIT p_limit
  OFFSET p_offset;
$func$;
