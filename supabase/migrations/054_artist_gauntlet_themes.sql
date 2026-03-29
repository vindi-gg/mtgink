-- Add artist theme support to daily gauntlet
-- Previously, artist themes were declared in the schema but never implemented:
-- no artist themes were seeded, and the ELSE fallback picked random creatures.

-- =============================================================================
-- 1. Seed artist themes: artists with 20+ distinct non-digital illustrations
-- =============================================================================

INSERT INTO gauntlet_themes (theme_type, pool_mode, label, description, artist, preview_set_code, preview_collector_number, preview_image_version, pool_size_estimate)
SELECT
  'artist', 'vs',
  sub.artist || ' Gauntlet',
  'Best cards illustrated by ' || sub.artist,
  sub.artist,
  sub.set_code, sub.collector_number, sub.image_version,
  sub.ill_count
FROM (
  SELECT
    p2.artist,
    COUNT(DISTINCT p2.illustration_id)::integer AS ill_count,
    -- Pick a recent printing for preview
    (ARRAY_AGG(p2.set_code ORDER BY s.released_at DESC))[1] AS set_code,
    (ARRAY_AGG(p2.collector_number ORDER BY s.released_at DESC))[1] AS collector_number,
    (ARRAY_AGG(p2.image_version ORDER BY s.released_at DESC))[1] AS image_version
  FROM printings p2
  JOIN sets s ON s.set_code = p2.set_code
  WHERE p2.illustration_id IS NOT NULL
    AND p2.artist IS NOT NULL
    AND s.digital = FALSE
  GROUP BY p2.artist
  HAVING COUNT(DISTINCT p2.illustration_id) >= 20
) sub
WHERE NOT EXISTS (
  SELECT 1 FROM gauntlet_themes gt
  WHERE gt.theme_type = 'artist' AND gt.artist = sub.artist
);

-- =============================================================================
-- 2. Update generate_daily_challenges() with artist handler
-- =============================================================================

DROP FUNCTION IF EXISTS generate_daily_challenges(DATE);
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
  -- Check if already generated
  SELECT COUNT(*) INTO v_existing_count
  FROM daily_challenges
  WHERE challenge_date = p_date;

  IF v_existing_count >= 1 THEN
    RETURN QUERY SELECT * FROM daily_challenges WHERE challenge_date = p_date;
    RETURN;
  END IF;

  -- Set deterministic seed from date
  v_seed := abs(hashtext(p_date::text)) / 2147483647.0;
  PERFORM setseed(v_seed);

  -- =========================================================================
  -- 2. Daily Gauntlet: pick a random theme type first, then random theme
  -- =========================================================================
  SELECT * INTO v_theme
  FROM gauntlet_themes
  WHERE is_active = TRUE
    AND theme_type = (
      SELECT theme_type FROM (
        SELECT DISTINCT theme_type FROM gauntlet_themes WHERE is_active = TRUE
      ) types ORDER BY random() LIMIT 1
    )
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
      SELECT v_theme.preview_set_code AS set_code, v_theme.preview_collector_number AS collector_number, v_theme.preview_image_version AS image_version
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

    ELSIF v_theme.theme_type = 'artist' THEN
      -- Artist: 10 random cards illustrated by this artist
      -- Uses specifically this artist's illustration for each card
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
        FROM printings p2
        JOIN sets s ON s.set_code = p2.set_code
        JOIN oracle_cards oc ON oc.oracle_id = p2.oracle_id
        WHERE p2.artist = v_theme.artist
          AND p2.illustration_id IS NOT NULL
          AND s.digital = FALSE
        ORDER BY oc.oracle_id, s.released_at DESC
      ) sub
      ORDER BY random()
      LIMIT 10;

      -- Preview from theme or first pool entry
      IF v_theme.preview_set_code IS NOT NULL THEN
        SELECT v_theme.preview_set_code AS set_code, v_theme.preview_collector_number AS collector_number, v_theme.preview_image_version AS image_version
        INTO v_gauntlet_preview;
      ELSE
        SELECT
          v_gauntlet_pool->0->>'set_code' AS set_code,
          v_gauntlet_pool->0->>'collector_number' AS collector_number,
          v_gauntlet_pool->0->>'image_version' AS image_version
        INTO v_gauntlet_preview;
      END IF;

    ELSE
      -- Fallback: 10 random creatures
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
