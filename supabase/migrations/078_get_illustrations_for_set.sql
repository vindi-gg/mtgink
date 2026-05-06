-- Powers the homepage art-listing grid: one row per illustration in a
-- given set (or any of its child sets — masterpieces like Mystical
-- Archive, commander/precon decks, etc., excluding tokens and art
-- series), with card name/slug for navigation, ELO rating, vote count,
-- and cheapest non-foil price. Sortable by popularity (ELO desc), A-Z
-- (card name asc), price (most expensive first, NULLs last), or latest
-- (collector_number desc, natural-number-aware so "100" beats "10"
-- beats "2"). total_count is a window-function count for paging.

CREATE OR REPLACE FUNCTION get_illustrations_for_set(
  p_set_code TEXT,
  p_sort TEXT DEFAULT 'popularity',
  p_limit INT DEFAULT 60,
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
    WHERE (
        s.set_code = p_set_code
        OR (s.parent_set_code = p_set_code
            AND s.set_type NOT IN ('token', 'memorabilia', 'art_series'))
      )
      AND p.illustration_id IS NOT NULL
      AND p.has_image = TRUE
    ORDER BY p.illustration_id,
      -- Prefer the parent (main) set's printing as the canonical art
      -- representative when the same illustration_id appears in both
      -- parent and a child set.
      CASE WHEN s.set_code = p_set_code THEN 0 ELSE 1 END,
      p.collector_number
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
    CASE WHEN p_sort = 'latest'
      THEN COALESCE((REGEXP_MATCH(collector_number, '^([0-9]+)'))[1]::INT, 0)
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'latest' THEN collector_number END DESC NULLS LAST,
    card_name ASC,
    illustration_id
  LIMIT p_limit
  OFFSET p_offset;
$func$;
