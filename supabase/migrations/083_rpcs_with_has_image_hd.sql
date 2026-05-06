-- Surface printings.has_image_hd on the illustration-listing RPCs so the
-- lightbox can prefer the locally-hosted HD variant (sourced from
-- TCGPlayer at fit-in/2000x2000) when available, falling back to
-- Scryfall PNG otherwise.

DROP FUNCTION IF EXISTS get_illustrations_for_card(UUID);
DROP FUNCTION IF EXISTS get_illustrations_for_set(TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS get_top_illustrations(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION get_illustrations_for_card(p_oracle_id UUID)
RETURNS TABLE(
  illustration_id UUID,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT,
  image_version TEXT,
  is_full_art BOOLEAN,
  scryfall_id UUID,
  has_image_hd BOOLEAN
)
LANGUAGE sql STABLE
AS $func$
  SELECT DISTINCT ON (p.illustration_id)
    p.illustration_id,
    p.artist,
    p.set_code,
    s.name AS set_name,
    p.collector_number,
    p.released_at,
    p.image_version,
    p.is_full_art,
    p.scryfall_id,
    p.has_image_hd
  FROM printings p
  JOIN sets s ON s.set_code = p.set_code
  WHERE p.oracle_id = p_oracle_id
    AND p.illustration_id IS NOT NULL
    AND s.digital = FALSE
    AND p.has_image = TRUE
  ORDER BY p.illustration_id,
    CASE s.set_type
      WHEN 'expansion' THEN 1
      WHEN 'core' THEN 2
      WHEN 'masters' THEN 3
      WHEN 'draft_innovation' THEN 4
      WHEN 'commander' THEN 5
      ELSE 6
    END,
    p.released_at DESC;
$func$;

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
  is_full_art BOOLEAN,
  scryfall_id UUID,
  has_image_hd BOOLEAN,
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
      p.image_version,
      p.is_full_art,
      p.scryfall_id,
      p.has_image_hd
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
    elo_rating, vote_count, cheapest_price, is_full_art, scryfall_id,
    has_image_hd, total_count
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
  is_full_art BOOLEAN,
  scryfall_id UUID,
  has_image_hd BOOLEAN,
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
      p.image_version,
      p.is_full_art,
      p.scryfall_id,
      p.has_image_hd
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
    elo_rating, vote_count, cheapest_price, is_full_art, scryfall_id,
    has_image_hd, total_count
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
