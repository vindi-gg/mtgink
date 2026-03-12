-- Gauntlet Themes: pre-built theme registry + daily challenge updates
-- Themes power both the gauntlet button and daily gauntlet challenges

-- =============================================================================
-- 1. Create gauntlet_themes table
-- =============================================================================

CREATE TABLE gauntlet_themes (
  id SERIAL PRIMARY KEY,
  theme_type TEXT NOT NULL,     -- 'card_remix' | 'tribe' | 'tag' | 'set' | 'artist'
  pool_mode TEXT NOT NULL,      -- 'remix' (illustrations) | 'vs' (cards)
  label TEXT NOT NULL,          -- "Lightning Bolt Remix", "Dragon Gauntlet"
  description TEXT,

  -- Filter params (one set per theme_type)
  oracle_id UUID,               -- card_remix: specific card
  tribe TEXT,                   -- tribe: creature subtype
  tag_id TEXT,                  -- tag: tag identifier
  set_code TEXT,                -- set: expansion code
  artist TEXT,                  -- artist: artist name

  -- Display
  preview_set_code TEXT,
  preview_collector_number TEXT,
  preview_image_version TEXT,

  -- Meta
  pool_size_estimate INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gauntlet_themes_type ON gauntlet_themes(theme_type);
CREATE INDEX idx_gauntlet_themes_active ON gauntlet_themes(is_active) WHERE is_active = TRUE;

-- RLS: public read, service_role write
ALTER TABLE gauntlet_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gauntlet_themes_public_read" ON gauntlet_themes FOR SELECT USING (true);

-- =============================================================================
-- 2. Add theme_id to daily_challenges
-- =============================================================================

ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS theme_id INTEGER REFERENCES gauntlet_themes(id);

-- =============================================================================
-- 3. Populate themes from existing data
-- =============================================================================

-- 3a. Card remix themes: cards with 8+ non-digital illustrations
INSERT INTO gauntlet_themes (theme_type, pool_mode, label, description, oracle_id, preview_set_code, preview_collector_number, preview_image_version, pool_size_estimate)
SELECT
  'card_remix', 'remix',
  oc.name || ' Remix',
  'All illustrations of ' || oc.name,
  oc.oracle_id,
  p.set_code, p.collector_number, p.image_version,
  counts.ill_count
FROM (
  SELECT p2.oracle_id, COUNT(DISTINCT p2.illustration_id)::integer AS ill_count
  FROM printings p2
  JOIN sets s ON s.set_code = p2.set_code
  WHERE p2.illustration_id IS NOT NULL AND s.digital = FALSE
  GROUP BY p2.oracle_id
  HAVING COUNT(DISTINCT p2.illustration_id) >= 8
) counts
JOIN oracle_cards oc ON oc.oracle_id = counts.oracle_id
JOIN LATERAL (
  SELECT p2.set_code, p2.collector_number, p2.image_version
  FROM printings p2
  JOIN sets s ON s.set_code = p2.set_code
  WHERE p2.oracle_id = oc.oracle_id AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
  ORDER BY s.released_at DESC
  LIMIT 1
) p ON TRUE;

-- 3b. Tribe themes: creature subtypes with 20+ cards
INSERT INTO gauntlet_themes (theme_type, pool_mode, label, description, tribe, pool_size_estimate)
SELECT
  'tribe', 'vs',
  tribes.tribe_name || ' Gauntlet',
  'Best ' || tribes.tribe_name || ' creatures in Magic',
  tribes.tribe_name,
  tribes.card_count
FROM (
  SELECT sub.tribe AS tribe_name, COUNT(DISTINCT sub.oid) AS card_count
  FROM (
    SELECT oc.oracle_id AS oid,
           TRIM(UNNEST(STRING_TO_ARRAY(SPLIT_PART(oc.type_line, E'\u2014', 2), ' '))) AS tribe
    FROM oracle_cards oc
    WHERE oc.type_line LIKE '%Creature%'
      AND oc.type_line LIKE E'%\u2014%'
  ) sub
  WHERE LENGTH(sub.tribe) > 1
  GROUP BY sub.tribe
  HAVING COUNT(DISTINCT sub.oid) >= 20
) tribes;

-- 3c. Tag themes: oracle tags with 30+ associated cards
INSERT INTO gauntlet_themes (theme_type, pool_mode, label, description, tag_id, pool_size_estimate)
SELECT
  'tag', 'vs',
  t.label || ' Gauntlet',
  'Cards tagged: ' || t.label,
  t.tag_id,
  tag_counts.card_count
FROM (
  SELECT ot.tag_id, COUNT(DISTINCT ot.oracle_id)::integer AS card_count
  FROM oracle_tags ot
  GROUP BY ot.tag_id
  HAVING COUNT(DISTINCT ot.oracle_id) >= 30
) tag_counts
JOIN tags t ON t.tag_id = tag_counts.tag_id
WHERE t.type = 'oracle';

-- =============================================================================
-- 4. Update generate_daily_challenges() — themes + remix 2-image picker
-- =============================================================================

-- Clean up today's challenges so they regenerate with new format
DELETE FROM daily_challenge_stats
WHERE challenge_id IN (SELECT id FROM daily_challenges WHERE challenge_date = CURRENT_DATE);
DELETE FROM daily_participations
WHERE challenge_id IN (SELECT id FROM daily_challenges WHERE challenge_date = CURRENT_DATE);
DELETE FROM daily_challenges WHERE challenge_date = CURRENT_DATE;

CREATE OR REPLACE FUNCTION generate_daily_challenges(p_date DATE)
RETURNS SETOF daily_challenges
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_count INTEGER;
  v_seed DOUBLE PRECISION;
  v_remix_oracle_id UUID;
  v_remix_card_name TEXT;
  v_remix_card_slug TEXT;
  v_remix_preview RECORD;
  v_remix_ill_a UUID;
  v_remix_ill_b UUID;
  v_theme RECORD;
  v_gauntlet_pool JSONB;
  v_gauntlet_mode TEXT;
  v_gauntlet_title TEXT;
  v_gauntlet_description TEXT;
  v_gauntlet_preview RECORD;
BEGIN
  -- Check if already generated (2 challenges: remix + gauntlet)
  SELECT COUNT(*) INTO v_existing_count
  FROM daily_challenges
  WHERE challenge_date = p_date;

  IF v_existing_count >= 2 THEN
    RETURN QUERY SELECT * FROM daily_challenges WHERE challenge_date = p_date;
    RETURN;
  END IF;

  -- Set deterministic seed from date
  v_seed := abs(hashtext(p_date::text)) / 2147483647.0;
  PERFORM setseed(v_seed);

  -- =========================================================================
  -- 1. Daily Remix: one card, two illustrations, one vote
  -- =========================================================================
  SELECT oc.oracle_id, oc.name, oc.slug
  INTO v_remix_oracle_id, v_remix_card_name, v_remix_card_slug
  FROM oracle_cards oc
  WHERE (
    SELECT COUNT(DISTINCT p2.illustration_id)
    FROM printings p2
    JOIN sets s ON s.set_code = p2.set_code
    WHERE p2.oracle_id = oc.oracle_id
      AND p2.illustration_id IS NOT NULL
      AND s.digital = FALSE
  ) >= 5
  ORDER BY random()
  LIMIT 1;

  -- Pick 2 random illustrations for this card
  SELECT ill_ids[1], ill_ids[2]
  INTO v_remix_ill_a, v_remix_ill_b
  FROM (
    SELECT ARRAY_AGG(sub.illustration_id ORDER BY random()) AS ill_ids
    FROM (
      SELECT DISTINCT p2.illustration_id
      FROM printings p2
      JOIN sets s ON s.set_code = p2.set_code
      WHERE p2.oracle_id = v_remix_oracle_id
        AND p2.illustration_id IS NOT NULL
        AND s.digital = FALSE
    ) sub
  ) agg;

  -- Get preview image for remix (use illustration_a's printing)
  SELECT p2.set_code, p2.collector_number, p2.image_version
  INTO v_remix_preview
  FROM printings p2
  JOIN sets s ON s.set_code = p2.set_code
  WHERE p2.oracle_id = v_remix_oracle_id
    AND p2.illustration_id = v_remix_ill_a
    AND s.digital = FALSE
  ORDER BY s.released_at DESC
  LIMIT 1;

  INSERT INTO daily_challenges (
    challenge_date, challenge_type, oracle_id,
    illustration_id_a, illustration_id_b,
    title, description,
    preview_set_code, preview_collector_number, preview_image_version
  ) VALUES (
    p_date, 'remix', v_remix_oracle_id,
    v_remix_ill_a, v_remix_ill_b,
    v_remix_card_name || ' Remix',
    'Which ' || v_remix_card_name || ' art is better?',
    v_remix_preview.set_code, v_remix_preview.collector_number, v_remix_preview.image_version
  ) ON CONFLICT (challenge_date, challenge_type) DO NOTHING;

  -- =========================================================================
  -- 2. Daily Gauntlet: pick a random theme
  -- =========================================================================
  SELECT * INTO v_theme
  FROM gauntlet_themes
  WHERE is_active = TRUE
  ORDER BY random()
  LIMIT 1;

  IF FOUND THEN
    v_gauntlet_title := v_theme.label;
    v_gauntlet_description := v_theme.description;

    IF v_theme.theme_type = 'card_remix' THEN
      -- Card remix: all illustrations of one card
      v_gauntlet_mode := 'remix';

      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id,
        'illustration_id', sub.illustration_id,
        'name', sub.name,
        'slug', sub.slug,
        'artist', sub.artist,
        'set_code', sub.set_code,
        'set_name', sub.set_name,
        'collector_number', sub.collector_number,
        'image_version', sub.image_version,
        'type_line', sub.type_line,
        'mana_cost', sub.mana_cost
      ))
      INTO v_gauntlet_pool
      FROM (
        SELECT DISTINCT ON (p2.illustration_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version,
          oc.type_line, oc.mana_cost
        FROM printings p2
        JOIN sets s ON s.set_code = p2.set_code
        JOIN oracle_cards oc ON oc.oracle_id = p2.oracle_id
        WHERE p2.oracle_id = v_theme.oracle_id
          AND p2.illustration_id IS NOT NULL
          AND s.digital = FALSE
        ORDER BY p2.illustration_id, s.released_at DESC
        LIMIT 10
      ) sub;

      -- Preview from theme
      SELECT v_theme.preview_set_code, v_theme.preview_collector_number, v_theme.preview_image_version
      INTO v_gauntlet_preview;

    ELSIF v_theme.theme_type = 'tribe' THEN
      -- Tribe: 10 random creatures of that subtype
      v_gauntlet_mode := 'vs';

      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id,
        'illustration_id', sub.illustration_id,
        'name', sub.name,
        'slug', sub.slug,
        'artist', sub.artist,
        'set_code', sub.set_code,
        'set_name', sub.set_name,
        'collector_number', sub.collector_number,
        'image_version', sub.image_version,
        'type_line', sub.type_line,
        'mana_cost', sub.mana_cost
      ))
      INTO v_gauntlet_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version,
          oc.type_line, oc.mana_cost
        FROM oracle_cards oc
        JOIN printings p2 ON p2.oracle_id = oc.oracle_id
        JOIN sets s ON s.set_code = p2.set_code
        WHERE oc.type_line LIKE '%' || v_theme.tribe || '%'
          AND oc.type_line LIKE '%Creature%'
          AND p2.illustration_id IS NOT NULL
          AND s.digital = FALSE
        ORDER BY oc.oracle_id, random()
      ) sub
      ORDER BY random()
      LIMIT 10;

      -- Preview from first pool entry
      SELECT
        v_gauntlet_pool->0->>'set_code' AS set_code,
        v_gauntlet_pool->0->>'collector_number' AS collector_number,
        v_gauntlet_pool->0->>'image_version' AS image_version
      INTO v_gauntlet_preview;

    ELSIF v_theme.theme_type = 'tag' THEN
      -- Tag: 10 random cards with this tag
      v_gauntlet_mode := 'vs';

      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id,
        'illustration_id', sub.illustration_id,
        'name', sub.name,
        'slug', sub.slug,
        'artist', sub.artist,
        'set_code', sub.set_code,
        'set_name', sub.set_name,
        'collector_number', sub.collector_number,
        'image_version', sub.image_version,
        'type_line', sub.type_line,
        'mana_cost', sub.mana_cost
      ))
      INTO v_gauntlet_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version,
          oc.type_line, oc.mana_cost
        FROM oracle_tags ot
        JOIN oracle_cards oc ON oc.oracle_id = ot.oracle_id
        JOIN printings p2 ON p2.oracle_id = oc.oracle_id
        JOIN sets s ON s.set_code = p2.set_code
        WHERE ot.tag_id = v_theme.tag_id
          AND p2.illustration_id IS NOT NULL
          AND s.digital = FALSE
        ORDER BY oc.oracle_id, random()
      ) sub
      ORDER BY random()
      LIMIT 10;

      -- Preview from first pool entry
      SELECT
        v_gauntlet_pool->0->>'set_code' AS set_code,
        v_gauntlet_pool->0->>'collector_number' AS collector_number,
        v_gauntlet_pool->0->>'image_version' AS image_version
      INTO v_gauntlet_preview;

    ELSE
      -- Fallback: 10 random creatures (set/artist themes etc.)
      v_gauntlet_mode := 'vs';

      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id,
        'illustration_id', sub.illustration_id,
        'name', sub.name,
        'slug', sub.slug,
        'artist', sub.artist,
        'set_code', sub.set_code,
        'set_name', sub.set_name,
        'collector_number', sub.collector_number,
        'image_version', sub.image_version,
        'type_line', sub.type_line,
        'mana_cost', sub.mana_cost
      ))
      INTO v_gauntlet_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version,
          oc.type_line, oc.mana_cost
        FROM oracle_cards oc
        JOIN printings p2 ON p2.oracle_id = oc.oracle_id
        JOIN sets s ON s.set_code = p2.set_code
        WHERE oc.type_line LIKE '%Creature%'
          AND p2.illustration_id IS NOT NULL
          AND s.digital = FALSE
        ORDER BY oc.oracle_id, random()
      ) sub
      ORDER BY random()
      LIMIT 10;

      SELECT
        v_gauntlet_pool->0->>'set_code' AS set_code,
        v_gauntlet_pool->0->>'collector_number' AS collector_number,
        v_gauntlet_pool->0->>'image_version' AS image_version
      INTO v_gauntlet_preview;
    END IF;

    INSERT INTO daily_challenges (
      challenge_date, challenge_type,
      oracle_id, pool, gauntlet_mode, theme_id,
      title, description,
      preview_set_code, preview_collector_number, preview_image_version
    ) VALUES (
      p_date, 'gauntlet',
      CASE WHEN v_theme.theme_type = 'card_remix' THEN v_theme.oracle_id ELSE NULL END,
      v_gauntlet_pool, v_gauntlet_mode, v_theme.id,
      v_gauntlet_title, v_gauntlet_description,
      v_gauntlet_preview.set_code, v_gauntlet_preview.collector_number, v_gauntlet_preview.image_version
    ) ON CONFLICT (challenge_date, challenge_type) DO NOTHING;
  END IF;

  -- Create empty stats rows
  INSERT INTO daily_challenge_stats (challenge_id)
  SELECT id FROM daily_challenges WHERE challenge_date = p_date
  ON CONFLICT (challenge_id) DO NOTHING;

  RETURN QUERY SELECT * FROM daily_challenges WHERE challenge_date = p_date;
END;
$$;
