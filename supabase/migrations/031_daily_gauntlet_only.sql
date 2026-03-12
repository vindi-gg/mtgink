-- Simplify daily challenges: gauntlet only, pool size 20
-- Remove daily remix and VS, keep only daily gauntlet

CREATE OR REPLACE FUNCTION generate_daily_challenges(p_date DATE DEFAULT CURRENT_DATE)
RETURNS SETOF daily_challenges
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_count INTEGER;
  v_seed DOUBLE PRECISION;
  v_theme RECORD;
  v_gauntlet_pool JSONB;
  v_gauntlet_mode TEXT;
  v_gauntlet_title TEXT;
  v_gauntlet_description TEXT;
  v_preview_set_code TEXT;
  v_preview_collector_number TEXT;
  v_preview_image_version TEXT;
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

  -- Pick a random VS theme with enough cards for a meaningful gauntlet
  SELECT * INTO v_theme
  FROM gauntlet_themes
  WHERE is_active = TRUE
    AND pool_mode = 'vs'
    AND (pool_size_estimate IS NULL OR pool_size_estimate >= 10)
  ORDER BY random()
  LIMIT 1;

  IF FOUND THEN
    v_gauntlet_title := v_theme.label;
    v_gauntlet_description := v_theme.description;

    IF v_theme.theme_type = 'card_remix' THEN
      -- Card remix: all illustrations of one card (up to 20)
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
        LIMIT 20
      ) sub;

      -- Preview from theme
      v_preview_set_code := v_theme.preview_set_code;
      v_preview_collector_number := v_theme.preview_collector_number;
      v_preview_image_version := v_theme.preview_image_version;

    ELSIF v_theme.theme_type = 'tribe' THEN
      -- Tribe: 20 random creatures of that subtype
      v_gauntlet_mode := 'vs';

      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub2.oracle_id,
        'illustration_id', sub2.illustration_id,
        'name', sub2.name,
        'slug', sub2.slug,
        'artist', sub2.artist,
        'set_code', sub2.set_code,
        'set_name', sub2.set_name,
        'collector_number', sub2.collector_number,
        'image_version', sub2.image_version,
        'type_line', sub2.type_line,
        'mana_cost', sub2.mana_cost
      ))
      INTO v_gauntlet_pool
      FROM (
        SELECT * FROM (
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
            AND oc.name NOT LIKE 'A-%'
          ORDER BY oc.oracle_id, random()
        ) sub
        ORDER BY random()
        LIMIT 20
      ) sub2;

      -- Preview from first pool entry
      v_preview_set_code := v_gauntlet_pool->0->>'set_code';
      v_preview_collector_number := v_gauntlet_pool->0->>'collector_number';
      v_preview_image_version := v_gauntlet_pool->0->>'image_version';

    ELSIF v_theme.theme_type = 'tag' THEN
      -- Tag: 20 random cards with this tag
      v_gauntlet_mode := 'vs';

      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub2.oracle_id,
        'illustration_id', sub2.illustration_id,
        'name', sub2.name,
        'slug', sub2.slug,
        'artist', sub2.artist,
        'set_code', sub2.set_code,
        'set_name', sub2.set_name,
        'collector_number', sub2.collector_number,
        'image_version', sub2.image_version,
        'type_line', sub2.type_line,
        'mana_cost', sub2.mana_cost
      ))
      INTO v_gauntlet_pool
      FROM (
        SELECT * FROM (
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
            AND oc.name NOT LIKE 'A-%'
          ORDER BY oc.oracle_id, random()
        ) sub
        ORDER BY random()
        LIMIT 20
      ) sub2;

      -- Preview from first pool entry
      v_preview_set_code := v_gauntlet_pool->0->>'set_code';
      v_preview_collector_number := v_gauntlet_pool->0->>'collector_number';
      v_preview_image_version := v_gauntlet_pool->0->>'image_version';

    ELSE
      -- Fallback: 20 random creatures
      v_gauntlet_mode := 'vs';

      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub2.oracle_id,
        'illustration_id', sub2.illustration_id,
        'name', sub2.name,
        'slug', sub2.slug,
        'artist', sub2.artist,
        'set_code', sub2.set_code,
        'set_name', sub2.set_name,
        'collector_number', sub2.collector_number,
        'image_version', sub2.image_version,
        'type_line', sub2.type_line,
        'mana_cost', sub2.mana_cost
      ))
      INTO v_gauntlet_pool
      FROM (
        SELECT * FROM (
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
            AND oc.name NOT LIKE 'A-%'
          ORDER BY oc.oracle_id, random()
        ) sub
        ORDER BY random()
        LIMIT 20
      ) sub2;

      v_preview_set_code := v_gauntlet_pool->0->>'set_code';
      v_preview_collector_number := v_gauntlet_pool->0->>'collector_number';
      v_preview_image_version := v_gauntlet_pool->0->>'image_version';
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
      v_preview_set_code, v_preview_collector_number, v_preview_image_version
    ) ON CONFLICT (challenge_date, challenge_type) DO NOTHING;
  END IF;

  -- Create empty stats rows
  INSERT INTO daily_challenge_stats (challenge_id)
  SELECT id FROM daily_challenges WHERE challenge_date = p_date
  ON CONFLICT (challenge_id) DO NOTHING;

  RETURN QUERY SELECT * FROM daily_challenges WHERE challenge_date = p_date;
END;
$$;
