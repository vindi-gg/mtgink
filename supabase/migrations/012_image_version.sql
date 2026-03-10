-- Add image_version column to printings for cache-busting CDN URLs.
-- Extracted from Scryfall image_uris query parameter (Unix timestamp).
-- Usage: cdn.mtg.ink/{set_code}/{collector_number}_art_crop.jpg?v={image_version}

ALTER TABLE printings ADD COLUMN IF NOT EXISTS image_version TEXT;

-- Also add hero_image_version to artists table
ALTER TABLE artists ADD COLUMN IF NOT EXISTS hero_image_version TEXT;

-- Populate from existing image_uris JSONB
UPDATE printings
SET image_version = (
  REGEXP_MATCH(
    COALESCE(image_uris->>'art_crop', image_uris->>'normal', ''),
    '\?(\d+)$'
  )
)[1]
WHERE image_uris IS NOT NULL;

-- Populate artists hero_image_version from printings
UPDATE artists a
SET hero_image_version = p.image_version
FROM printings p
WHERE p.set_code = a.hero_set_code
  AND p.collector_number = a.hero_collector_number
  AND a.hero_set_code IS NOT NULL;

-- Changing RETURNS TABLE requires DROP first (Postgres can't alter return type in-place)

-- 1. get_illustrations_for_card: add image_version
DROP FUNCTION IF EXISTS get_illustrations_for_card(UUID);
CREATE OR REPLACE FUNCTION get_illustrations_for_card(p_oracle_id UUID)
RETURNS TABLE (
  illustration_id UUID,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (p.illustration_id)
    p.illustration_id,
    p.artist,
    p.set_code,
    s.name AS set_name,
    p.collector_number,
    p.released_at,
    p.image_version
  FROM printings p
  JOIN sets s ON s.set_code = p.set_code
  JOIN oracle_cards o ON o.oracle_id = p.oracle_id
  WHERE p.oracle_id = p_oracle_id
    AND p.illustration_id IS NOT NULL
    AND o.layout != 'art_series'
  ORDER BY p.illustration_id,
    CASE s.set_type
      WHEN 'expansion' THEN 1
      WHEN 'core' THEN 2
      WHEN 'masters' THEN 3
      WHEN 'draft_innovation' THEN 4
      WHEN 'commander' THEN 5
      ELSE 6
    END,
    p.released_at ASC;
$$;

-- 2. get_comparison_pair: add image_version
DROP FUNCTION IF EXISTS get_comparison_pair(UUID);
CREATE OR REPLACE FUNCTION get_comparison_pair(p_oracle_id UUID)
RETURNS TABLE (
  illustration_id UUID,
  oracle_id UUID,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT,
  elo_rating REAL,
  vote_count INTEGER,
  win_count INTEGER,
  loss_count INTEGER,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  WITH ills AS (
    SELECT
      p.illustration_id,
      p.oracle_id,
      p.artist,
      p.set_code,
      s.name AS set_name,
      p.collector_number,
      p.released_at,
      p.image_version
    FROM printings p
    JOIN sets s ON p.set_code = s.set_code
    WHERE p.oracle_id = p_oracle_id
      AND p.illustration_id IS NOT NULL
      AND p.scryfall_id = (
        SELECT p2.scryfall_id
        FROM printings p2
        JOIN sets s2 ON p2.set_code = s2.set_code
        WHERE p2.illustration_id = p.illustration_id
          AND p2.oracle_id = p.oracle_id
        ORDER BY
          CASE s2.set_type
            WHEN 'expansion' THEN 1
            WHEN 'core' THEN 2
            WHEN 'draft_innovation' THEN 3
            WHEN 'masters' THEN 4
            WHEN 'commander' THEN 5
            ELSE 6
          END,
          p2.released_at ASC
        LIMIT 1
      )
  )
  SELECT
    i.illustration_id,
    i.oracle_id,
    i.artist,
    i.set_code,
    i.set_name,
    i.collector_number,
    i.released_at,
    ar.elo_rating,
    ar.vote_count,
    ar.win_count,
    ar.loss_count,
    i.image_version
  FROM ills i
  LEFT JOIN art_ratings ar ON ar.illustration_id = i.illustration_id
  ORDER BY RANDOM()
  LIMIT 2;
$$;

-- 3. get_cross_comparison_pair: add image_version
DROP FUNCTION IF EXISTS get_cross_comparison_pair(UUID, UUID);
CREATE OR REPLACE FUNCTION get_cross_comparison_pair(p_oracle_id_a UUID, p_oracle_id_b UUID)
RETURNS TABLE (
  illustration_id UUID,
  oracle_id UUID,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT,
  elo_rating REAL,
  vote_count INTEGER,
  win_count INTEGER,
  loss_count INTEGER,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  WITH ills AS (
    SELECT
      p.illustration_id,
      p.oracle_id,
      p.artist,
      p.set_code,
      s.name AS set_name,
      p.collector_number,
      p.released_at,
      p.image_version
    FROM printings p
    JOIN sets s ON p.set_code = s.set_code
    WHERE p.oracle_id IN (p_oracle_id_a, p_oracle_id_b)
      AND p.illustration_id IS NOT NULL
      AND p.scryfall_id = (
        SELECT p2.scryfall_id
        FROM printings p2
        JOIN sets s2 ON p2.set_code = s2.set_code
        WHERE p2.illustration_id = p.illustration_id
          AND p2.oracle_id = p.oracle_id
        ORDER BY
          CASE s2.set_type
            WHEN 'expansion' THEN 1
            WHEN 'core' THEN 2
            WHEN 'draft_innovation' THEN 3
            WHEN 'masters' THEN 4
            WHEN 'commander' THEN 5
            ELSE 6
          END,
          p2.released_at ASC
        LIMIT 1
      )
  ),
  pick_a AS (
    SELECT * FROM ills WHERE ills.oracle_id = p_oracle_id_a ORDER BY RANDOM() LIMIT 1
  ),
  pick_b AS (
    SELECT * FROM ills WHERE ills.oracle_id = p_oracle_id_b ORDER BY RANDOM() LIMIT 1
  ),
  picks AS (
    SELECT * FROM pick_a UNION ALL SELECT * FROM pick_b
  )
  SELECT
    pk.illustration_id,
    pk.oracle_id,
    pk.artist,
    pk.set_code,
    pk.set_name,
    pk.collector_number,
    pk.released_at,
    ar.elo_rating,
    ar.vote_count,
    ar.win_count,
    ar.loss_count,
    pk.image_version
  FROM picks pk
  LEFT JOIN art_ratings ar ON ar.illustration_id = pk.illustration_id;
$$;

-- 4. get_random_bracket_cards: add image_version
DROP FUNCTION IF EXISTS get_random_bracket_cards(INTEGER);
CREATE OR REPLACE FUNCTION get_random_bracket_cards(p_count INTEGER DEFAULT 32)
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  type_line TEXT,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  illustration_id UUID,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    o.oracle_id,
    o.name,
    o.slug,
    o.type_line,
    p.artist,
    p.set_code,
    s.name AS set_name,
    p.collector_number,
    p.illustration_id,
    p.image_version
  FROM oracle_cards o
  JOIN printings p ON p.oracle_id = o.oracle_id
  JOIN sets s ON p.set_code = s.set_code
  WHERE o.type_line NOT LIKE 'Token%'
    AND o.type_line NOT LIKE '%Emblem%'
    AND p.illustration_id IS NOT NULL
    AND p.scryfall_id = (
      SELECT p2.scryfall_id
      FROM printings p2
      JOIN sets s2 ON p2.set_code = s2.set_code
      WHERE p2.oracle_id = o.oracle_id
        AND p2.illustration_id IS NOT NULL
      ORDER BY
        CASE s2.set_type
          WHEN 'expansion' THEN 1
          WHEN 'core' THEN 2
          WHEN 'masters' THEN 3
          WHEN 'draft_innovation' THEN 4
          WHEN 'commander' THEN 5
          ELSE 6
        END,
        p2.released_at DESC
      LIMIT 1
    )
  ORDER BY RANDOM()
  LIMIT p_count;
$$;

-- 5. get_clash_pair: add image_version
DROP FUNCTION IF EXISTS get_clash_pair(UUID, UUID);
CREATE OR REPLACE FUNCTION get_clash_pair(p_oracle_id_a UUID, p_oracle_id_b UUID)
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  type_line TEXT,
  mana_cost TEXT,
  colors JSONB,
  cmc REAL,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  illustration_id UUID,
  elo_rating REAL,
  vote_count INTEGER,
  win_count INTEGER,
  loss_count INTEGER,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  WITH cards AS (
    SELECT
      o.oracle_id,
      o.name,
      o.slug,
      o.type_line,
      o.mana_cost,
      o.colors,
      o.cmc,
      p.artist,
      p.set_code,
      s.name AS set_name,
      p.collector_number,
      p.illustration_id,
      p.image_version
    FROM oracle_cards o
    JOIN printings p ON p.oracle_id = o.oracle_id
    JOIN sets s ON p.set_code = s.set_code
    WHERE o.oracle_id IN (p_oracle_id_a, p_oracle_id_b)
      AND p.illustration_id IS NOT NULL
      AND p.scryfall_id = (
        SELECT p2.scryfall_id
        FROM printings p2
        JOIN sets s2 ON p2.set_code = s2.set_code
        WHERE p2.oracle_id = o.oracle_id
          AND p2.illustration_id IS NOT NULL
        ORDER BY
          CASE s2.set_type
            WHEN 'expansion' THEN 1
            WHEN 'core' THEN 2
            WHEN 'masters' THEN 3
            WHEN 'draft_innovation' THEN 4
            WHEN 'commander' THEN 5
            ELSE 6
          END,
          p2.released_at DESC
        LIMIT 1
      )
  )
  SELECT
    c.oracle_id,
    c.name,
    c.slug,
    c.type_line,
    c.mana_cost,
    c.colors,
    c.cmc,
    c.artist,
    c.set_code,
    c.set_name,
    c.collector_number,
    c.illustration_id,
    cr.elo_rating,
    cr.vote_count,
    cr.win_count,
    cr.loss_count,
    c.image_version
  FROM cards c
  LEFT JOIN card_ratings cr ON cr.oracle_id = c.oracle_id;
$$;

-- 6. get_card_cache: add image_version (keep all original fields)
DROP FUNCTION IF EXISTS get_card_cache();
CREATE OR REPLACE FUNCTION get_card_cache()
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  layout TEXT,
  type_line TEXT,
  mana_cost TEXT,
  colors JSONB,
  cmc REAL,
  illustration_count INTEGER,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (o.oracle_id)
    o.oracle_id,
    o.name,
    o.slug,
    o.layout,
    o.type_line,
    o.mana_cost,
    o.colors,
    o.cmc,
    o.illustration_count,
    p.image_version
  FROM oracle_cards o
  JOIN printings p ON p.oracle_id = o.oracle_id AND p.illustration_id IS NOT NULL
  JOIN sets s ON s.set_code = p.set_code
  WHERE o.layout != 'art_series'
  ORDER BY o.oracle_id,
    CASE s.set_type
      WHEN 'expansion' THEN 1
      WHEN 'core' THEN 2
      WHEN 'masters' THEN 3
      WHEN 'draft_innovation' THEN 4
      WHEN 'commander' THEN 5
      ELSE 6
    END,
    p.released_at DESC;
$$;

-- 7. get_artist_illustrations: add image_version
DROP FUNCTION IF EXISTS get_artist_illustrations(TEXT);
CREATE OR REPLACE FUNCTION get_artist_illustrations(p_artist_name TEXT)
RETURNS TABLE (
  illustration_id UUID,
  oracle_id UUID,
  card_name TEXT,
  card_slug TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT,
  elo_rating REAL,
  vote_count INTEGER,
  win_count INTEGER,
  loss_count INTEGER,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (p.illustration_id)
    p.illustration_id,
    p.oracle_id,
    o.name AS card_name,
    o.slug AS card_slug,
    p.set_code,
    s.name AS set_name,
    p.collector_number,
    p.released_at,
    ar.elo_rating,
    ar.vote_count,
    ar.win_count,
    ar.loss_count,
    p.image_version
  FROM printings p
  JOIN oracle_cards o ON o.oracle_id = p.oracle_id
  JOIN sets s ON s.set_code = p.set_code
  LEFT JOIN art_ratings ar ON ar.illustration_id = p.illustration_id
  WHERE p.artist = p_artist_name
    AND p.illustration_id IS NOT NULL
    AND o.layout != 'art_series'
  ORDER BY p.illustration_id,
    CASE s.set_type
      WHEN 'expansion' THEN 1
      WHEN 'core' THEN 2
      WHEN 'masters' THEN 3
      WHEN 'draft_innovation' THEN 4
      WHEN 'commander' THEN 5
      ELSE 6
    END,
    p.released_at ASC;
$$;
