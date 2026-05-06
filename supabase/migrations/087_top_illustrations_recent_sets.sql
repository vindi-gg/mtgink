-- Restrict the homepage all-art listing to illustrations whose *first*
-- printing landed in the recent window (default: since the released_at
-- of the 5th-most-recent mainline expansion). This:
--   - keeps reprints of old art OUT of the homepage popular sort
--     (Sol Ring's Reggie Lee art was reprinted in SOS/TMT/Marvel —
--     would slip through a naive set-code filter; with this, it's
--     skipped because its first print was decades ago)
--   - includes art from mainline expansion subsets (Mystical Archive,
--     Commander decks, etc.) since their illustrations are typically
--     new to that drop
--   - includes Secret Lair drops since each printing in `sld` carries
--     its own released_at and SLD art is exclusive by design
--   - includes upcoming sets (Hobbit, Marvel, RF) since the cutoff
--     uses released_at DESC; future-released sets bump the cutoff later
--
-- Pass p_recent_set_count = 0 to disable the filter.

DROP FUNCTION IF EXISTS get_top_illustrations(TEXT, INT, INT);
DROP FUNCTION IF EXISTS get_top_illustrations(TEXT, INT, INT, INT);

CREATE OR REPLACE FUNCTION get_top_illustrations(
  p_sort TEXT DEFAULT 'popularity',
  p_limit INT DEFAULT 30,
  p_offset INT DEFAULT 0,
  p_recent_set_count INT DEFAULT 5
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
  WITH cutoff AS (
    SELECT MIN(released_at) AS cutoff_date
    FROM (
      SELECT released_at FROM sets
      WHERE set_type = 'expansion'
        AND digital = FALSE
        AND card_count > 0
      ORDER BY released_at DESC NULLS LAST
      LIMIT GREATEST(p_recent_set_count, 1)
    ) recent
  ),
  -- Illustrations whose earliest-ever printing is on or after the cutoff.
  -- Filter is bypassed entirely when p_recent_set_count <= 0.
  qualified AS (
    SELECT illustration_id
    FROM (
      SELECT p.illustration_id, MIN(p.released_at) AS first_release
      FROM printings p
      WHERE p.illustration_id IS NOT NULL
      GROUP BY p.illustration_id
    ) f
    CROSS JOIN cutoff c
    WHERE p_recent_set_count <= 0
       OR f.first_release >= c.cutoff_date
  ),
  base AS (
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
      AND p.illustration_id IN (SELECT illustration_id FROM qualified)
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
      COALESCE(ar.vote_count, 0)::INTEGER AS vote_count,
      COALESCE(ps.value, 0)::REAL AS chosen_score
    FROM base b
    LEFT JOIN art_ratings ar ON ar.illustration_id = b.illustration_id
    LEFT JOIN popularity_signals ps
      ON ps.illustration_id = b.illustration_id
     AND ps.source = 'moxfield'
     AND ps.signal_type = 'commander_chosen_30d'
  ),
  -- Dedupe to one illustration per card so the homepage doesn't show
  -- "Sol Ring soc/128" right next to "Sol Ring tmc/59". Pick the
  -- illustration with the highest chosen_score (popular sort), latest
  -- release, and lowest collector number as tiebreakers — i.e. the
  -- card's "best" art in the current window.
  deduped AS (
    SELECT DISTINCT ON (oracle_id) *
    FROM enriched
    ORDER BY oracle_id,
      chosen_score DESC NULLS LAST,
      is_full_art DESC,
      released_at DESC NULLS LAST,
      illustration_id
  ),
  prices AS (
    SELECT p2.illustration_id, MIN(bp.market_price) AS cheapest_price
    FROM printings p2
    JOIN best_prices bp ON bp.scryfall_id = p2.scryfall_id
    WHERE p2.illustration_id IN (SELECT illustration_id FROM deduped)
      AND bp.market_price IS NOT NULL
    GROUP BY p2.illustration_id
  ),
  combined AS (
    SELECT e.*, pr.cheapest_price,
      COUNT(*) OVER () AS total_count
    FROM deduped e
    LEFT JOIN prices pr ON pr.illustration_id = e.illustration_id
  )
  SELECT
    illustration_id, oracle_id, card_name, card_slug, artist,
    set_code, set_name, collector_number, released_at, image_version,
    elo_rating, vote_count, cheapest_price, is_full_art, scryfall_id,
    has_image_hd, total_count
  FROM combined
  ORDER BY
    CASE WHEN p_sort = 'popularity' THEN chosen_score END DESC NULLS LAST,
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
