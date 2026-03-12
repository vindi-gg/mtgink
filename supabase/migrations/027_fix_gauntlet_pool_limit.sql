-- Fix: Add LIMIT 20 to remix gauntlet pool to prevent enormous pools.
-- Also delete today's broken gauntlet challenge so it regenerates with proper size.

DELETE FROM daily_challenge_stats
WHERE challenge_id IN (
  SELECT id FROM daily_challenges
  WHERE challenge_date = CURRENT_DATE AND challenge_type = 'gauntlet'
);
DELETE FROM daily_participations
WHERE challenge_id IN (
  SELECT id FROM daily_challenges
  WHERE challenge_date = CURRENT_DATE AND challenge_type = 'gauntlet'
);
DELETE FROM daily_challenges
WHERE challenge_date = CURRENT_DATE AND challenge_type = 'gauntlet';

CREATE OR REPLACE FUNCTION generate_daily_challenges(p_date DATE)
RETURNS SETOF daily_challenges
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_count INTEGER;
  v_seed DOUBLE PRECISION;
  v_day_of_week INTEGER;
  v_remix_oracle_id UUID;
  v_remix_card_name TEXT;
  v_remix_preview RECORD;
  v_vs_card_a RECORD;
  v_vs_card_b RECORD;
  v_gauntlet_pool JSONB;
  v_gauntlet_mode TEXT;
  v_gauntlet_title TEXT;
  v_gauntlet_oracle_id UUID;
  v_gauntlet_card_name TEXT;
  v_gauntlet_preview RECORD;
BEGIN
  -- Check if already generated
  SELECT COUNT(*) INTO v_existing_count
  FROM daily_challenges
  WHERE challenge_date = p_date;

  IF v_existing_count >= 3 THEN
    RETURN QUERY SELECT * FROM daily_challenges WHERE challenge_date = p_date;
    RETURN;
  END IF;

  -- Set deterministic seed from date
  v_seed := abs(hashtext(p_date::text)) / 2147483647.0;
  PERFORM setseed(v_seed);

  v_day_of_week := EXTRACT(DOW FROM p_date)::INTEGER; -- 0=Sun, 1=Mon, ...

  -- =========================================================================
  -- 1. Daily Remix: random card with 5+ non-digital illustrations
  -- =========================================================================
  SELECT oc.oracle_id, oc.name
  INTO v_remix_oracle_id, v_remix_card_name
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

  -- Get preview image for remix
  SELECT p2.set_code, p2.collector_number, p2.image_version
  INTO v_remix_preview
  FROM printings p2
  JOIN sets s ON s.set_code = p2.set_code
  WHERE p2.oracle_id = v_remix_oracle_id
    AND p2.illustration_id IS NOT NULL
    AND s.digital = FALSE
  ORDER BY s.released_at DESC
  LIMIT 1;

  INSERT INTO daily_challenges (
    challenge_date, challenge_type, oracle_id,
    title, description,
    preview_set_code, preview_collector_number, preview_image_version
  ) VALUES (
    p_date, 'remix', v_remix_oracle_id,
    v_remix_card_name || ' Remix',
    'Which ' || v_remix_card_name || ' art is the best?',
    v_remix_preview.set_code, v_remix_preview.collector_number, v_remix_preview.image_version
  ) ON CONFLICT (challenge_date, challenge_type) DO NOTHING;

  -- =========================================================================
  -- 2. Daily VS: two random creature cards
  -- =========================================================================
  SELECT oc.oracle_id, oc.name, p2.set_code AS prev_set_code,
         p2.collector_number AS prev_cn, p2.image_version AS prev_iv,
         p2.illustration_id
  INTO v_vs_card_a
  FROM oracle_cards oc
  JOIN printings p2 ON p2.oracle_id = oc.oracle_id
  JOIN sets s ON s.set_code = p2.set_code
  WHERE oc.type_line LIKE '%Creature%'
    AND p2.illustration_id IS NOT NULL
    AND s.digital = FALSE
  ORDER BY random()
  LIMIT 1;

  SELECT oc.oracle_id, oc.name, p2.set_code AS prev_set_code,
         p2.collector_number AS prev_cn, p2.image_version AS prev_iv,
         p2.illustration_id
  INTO v_vs_card_b
  FROM oracle_cards oc
  JOIN printings p2 ON p2.oracle_id = oc.oracle_id
  JOIN sets s ON s.set_code = p2.set_code
  WHERE oc.type_line LIKE '%Creature%'
    AND p2.illustration_id IS NOT NULL
    AND s.digital = FALSE
    AND oc.oracle_id != v_vs_card_a.oracle_id
  ORDER BY random()
  LIMIT 1;

  INSERT INTO daily_challenges (
    challenge_date, challenge_type,
    oracle_id_a, oracle_id_b, illustration_id_a, illustration_id_b,
    title, description,
    preview_set_code, preview_collector_number, preview_image_version
  ) VALUES (
    p_date, 'vs',
    v_vs_card_a.oracle_id, v_vs_card_b.oracle_id,
    v_vs_card_a.illustration_id, v_vs_card_b.illustration_id,
    v_vs_card_a.name || ' vs ' || v_vs_card_b.name,
    'Which creature reigns supreme?',
    v_vs_card_a.prev_set_code, v_vs_card_a.prev_cn, v_vs_card_a.prev_iv
  ) ON CONFLICT (challenge_date, challenge_type) DO NOTHING;

  -- =========================================================================
  -- 3. Daily Gauntlet: alternates remix (Mon/Wed/Fri) and VS (Tue/Thu/Sat/Sun)
  -- =========================================================================
  IF v_day_of_week IN (1, 3, 5) THEN
    -- Remix gauntlet: card with 8+ illustrations
    v_gauntlet_mode := 'remix';

    SELECT oc.oracle_id, oc.name
    INTO v_gauntlet_oracle_id, v_gauntlet_card_name
    FROM oracle_cards oc
    WHERE (
      SELECT COUNT(DISTINCT p2.illustration_id)
      FROM printings p2
      JOIN sets s ON s.set_code = p2.set_code
      WHERE p2.oracle_id = oc.oracle_id
        AND p2.illustration_id IS NOT NULL
        AND s.digital = FALSE
    ) >= 8
    AND oc.oracle_id != v_remix_oracle_id
    ORDER BY random()
    LIMIT 1;

    -- Build pool from illustrations (capped at 20)
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
      WHERE p2.oracle_id = v_gauntlet_oracle_id
        AND p2.illustration_id IS NOT NULL
        AND s.digital = FALSE
      ORDER BY p2.illustration_id, s.released_at DESC
      LIMIT 20
    ) sub;

    v_gauntlet_title := v_gauntlet_card_name || ' Gauntlet';

    -- Preview
    SELECT p2.set_code, p2.collector_number, p2.image_version
    INTO v_gauntlet_preview
    FROM printings p2
    JOIN sets s ON s.set_code = p2.set_code
    WHERE p2.oracle_id = v_gauntlet_oracle_id
      AND p2.illustration_id IS NOT NULL
      AND s.digital = FALSE
    ORDER BY s.released_at DESC
    LIMIT 1;
  ELSE
    -- VS gauntlet: 10 random creatures
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

    v_gauntlet_title := 'Daily Gauntlet';

    -- Preview from first pool entry
    SELECT
      v_gauntlet_pool->0->>'set_code' AS set_code,
      v_gauntlet_pool->0->>'collector_number' AS collector_number,
      v_gauntlet_pool->0->>'image_version' AS image_version
    INTO v_gauntlet_preview;
  END IF;

  INSERT INTO daily_challenges (
    challenge_date, challenge_type,
    oracle_id, pool, gauntlet_mode,
    title, description,
    preview_set_code, preview_collector_number, preview_image_version
  ) VALUES (
    p_date, 'gauntlet',
    CASE WHEN v_gauntlet_mode = 'remix' THEN v_gauntlet_oracle_id ELSE NULL END,
    v_gauntlet_pool, v_gauntlet_mode,
    v_gauntlet_title,
    CASE WHEN v_gauntlet_mode = 'remix'
      THEN 'King of the hill: ' || v_gauntlet_card_name || ' art'
      ELSE 'King of the hill: 10 random creatures'
    END,
    v_gauntlet_preview.set_code, v_gauntlet_preview.collector_number, v_gauntlet_preview.image_version
  ) ON CONFLICT (challenge_date, challenge_type) DO NOTHING;

  -- Create empty stats rows
  INSERT INTO daily_challenge_stats (challenge_id)
  SELECT id FROM daily_challenges WHERE challenge_date = p_date
  ON CONFLICT (challenge_id) DO NOTHING;

  RETURN QUERY SELECT * FROM daily_challenges WHERE challenge_date = p_date;
END;
$$;
