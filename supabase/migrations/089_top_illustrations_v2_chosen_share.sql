-- v2 of the homepage all-art listing using **dampened chosen-share**
-- instead of raw chosen count. Lives alongside v1 so we can A/B and
-- roll back via env var if it sucks.
--
-- Score: chosen_count / oracle_total ^ p_share_exponent
--   exponent = 0   -> pure raw chosen_count (== v1 behavior)
--   exponent = 1   -> pure share (Sol Ring buried, but cards with
--                     multiple iconic arts also get pushed down because
--                     their share gets fragmented across printings)
--   exponent ~0.85 -> sweet spot: ubiquitous staples like Sol Ring
--                     drop out of #1 but cards with strong new art
--                     across a fragmented oracle (Vampiric Tutor SOA,
--                     Jeska's Will SOA, Force of Will SOA) still
--                     surface near the top.
--
-- Floor: require oracle_total_decks >= p_min_oracle_decks so that a
-- card with 5 decks where all 5 picked the same art doesn't post 100%
-- share and dominate.

DROP FUNCTION IF EXISTS get_top_illustrations_v2(TEXT, INT, INT, INT, INT);
DROP FUNCTION IF EXISTS get_top_illustrations_v2(TEXT, INT, INT, INT, INT, REAL);

CREATE OR REPLACE FUNCTION get_top_illustrations_v2(
  p_sort TEXT DEFAULT 'popularity',
  p_limit INT DEFAULT 30,
  p_offset INT DEFAULT 0,
  p_recent_set_count INT DEFAULT 5,
  p_min_oracle_decks INT DEFAULT 50,
  p_share_exponent REAL DEFAULT 0.85
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
  -- Total distinct decks running each oracle. This is the share
  -- denominator. ~36K oracles, single pass over moxfield_deck_cards
  -- joined to printings.
  oracle_totals AS (
    SELECT p.oracle_id,
           COUNT(DISTINCT mdc.deck_id) AS oracle_total
    FROM moxfield_deck_cards mdc
    JOIN printings p ON p.scryfall_id = mdc.scryfall_id
    GROUP BY p.oracle_id
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
      COALESCE(ps.value, 0)::REAL AS chosen_count,
      COALESCE(ot.oracle_total, 0)::INT AS oracle_total,
      CASE
        WHEN COALESCE(ot.oracle_total, 0) >= p_min_oracle_decks
         AND ot.oracle_total > 0
        THEN COALESCE(ps.value, 0) / POWER(ot.oracle_total::REAL, p_share_exponent)
        ELSE 0
      END::REAL AS chosen_share
    FROM base b
    LEFT JOIN art_ratings ar ON ar.illustration_id = b.illustration_id
    LEFT JOIN popularity_signals ps
      ON ps.illustration_id = b.illustration_id
     AND ps.source = 'moxfield'
     AND ps.signal_type = 'commander_chosen_30d'
    LEFT JOIN oracle_totals ot ON ot.oracle_id = b.oracle_id
  ),
  -- One illustration per card. For popularity sort we pick the
  -- highest-share art, so the card's "best representative" surfaces.
  deduped AS (
    SELECT DISTINCT ON (oracle_id) *
    FROM enriched
    ORDER BY oracle_id,
      chosen_share DESC NULLS LAST,
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
    CASE WHEN p_sort = 'popularity' THEN chosen_share END DESC NULLS LAST,
    CASE WHEN p_sort = 'popularity' THEN chosen_count END DESC NULLS LAST,
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
