-- 074_daily_bracket.sql
-- Daily Bracket challenge: a second daily challenge alongside the gauntlet.
-- All users on the same day get the same deterministic 16-card bracket.
-- Community stats track per-position winner votes for the "consensus bracket"
-- revealed the following day.

-- =========================================================================
-- 0a. Fix get_random_cards subtype matching: use exact word match via
--     string_to_array instead of ILIKE '%Rat%' which matched 'Pirate'.
-- =========================================================================

DROP FUNCTION IF EXISTS get_random_cards(INTEGER, INTEGER, TEXT[], TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION get_random_cards(
  p_count INTEGER,
  p_min_illustrations INTEGER DEFAULT 1,
  p_colors TEXT[] DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_subtype TEXT DEFAULT NULL,
  p_set_code TEXT DEFAULT NULL,
  p_rules_text TEXT DEFAULT NULL
)
RETURNS TABLE(oracle_id UUID, name TEXT, slug TEXT, layout TEXT, type_line TEXT, mana_cost TEXT, colors JSONB, cmc REAL)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_colors IS NULL AND p_type IS NULL AND p_subtype IS NULL THEN
    RETURN QUERY
    SELECT o.oracle_id, o.name, o.slug, o.layout, o.type_line, o.mana_cost, o.colors, o.cmc
    FROM oracle_cards o
    WHERE o.illustration_count >= p_min_illustrations
      AND o.digital_only = FALSE
      AND (p_set_code IS NULL OR EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = o.oracle_id AND p.set_code = p_set_code))
    ORDER BY RANDOM() LIMIT p_count;
  END IF;
  IF p_type IS NULL AND p_subtype IS NULL THEN
    RETURN QUERY
    SELECT o.oracle_id, o.name, o.slug, o.layout, o.type_line, o.mana_cost, o.colors, o.cmc
    FROM oracle_cards o
    WHERE o.illustration_count >= p_min_illustrations
      AND o.digital_only = FALSE
      AND (p_colors IS NULL OR o.colors @> to_jsonb(p_colors))
      AND (p_set_code IS NULL OR EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = o.oracle_id AND p.set_code = p_set_code))
    ORDER BY RANDOM() LIMIT p_count;
  END IF;
  RETURN QUERY
  SELECT o.oracle_id, o.name, o.slug, o.layout, o.type_line, o.mana_cost, o.colors, o.cmc
  FROM oracle_cards o
  WHERE o.illustration_count >= p_min_illustrations
    AND o.digital_only = FALSE
    AND (p_colors IS NULL OR o.colors @> to_jsonb(p_colors))
    AND (p_set_code IS NULL OR EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = o.oracle_id AND p.set_code = p_set_code))
    AND (p_type IS NULL OR o.type_line ILIKE '%' || p_type || '%')
    AND (p_subtype IS NULL OR (
      o.type_line LIKE '%—%'
      AND p_subtype = ANY(string_to_array(trim(split_part(o.type_line, '—', 2)), ' '))
    ))
    AND (p_rules_text IS NULL OR o.oracle_text ILIKE '%' || p_rules_text || '%')
  ORDER BY RANDOM() LIMIT p_count;
END;
$$;

-- =========================================================================
-- 0b. Store brew creation filter flags so the edit page can re-resolve pools
-- =========================================================================

ALTER TABLE brews ADD COLUMN IF NOT EXISTS include_children BOOLEAN DEFAULT FALSE;
ALTER TABLE brews ADD COLUMN IF NOT EXISTS only_new_cards BOOLEAN DEFAULT FALSE;
ALTER TABLE brews ADD COLUMN IF NOT EXISTS first_illustration_only BOOLEAN DEFAULT FALSE;
ALTER TABLE brews ADD COLUMN IF NOT EXISTS last_illustration_only BOOLEAN DEFAULT FALSE;

-- NOTE: daily_challenges.brew_id FK intentionally uses NO ACTION (default).
-- Deleting a brew that's assigned to a challenge is blocked at the DB level.
-- The API returns a clear error and the admin brews listing shows an "Active"
-- badge so the admin knows to unassign or wait before deleting.

-- =========================================================================
-- 1. Schema additions
-- =========================================================================

-- Bracket size on the challenge row (null for non-bracket types).
ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS bracket_size INTEGER;

-- Per-position matchup vote aggregation for bracket challenges.
-- Shape: { "0-0": { "ill-uuid-a": 42, "ill-uuid-b": 18 }, ... }
ALTER TABLE daily_challenge_stats ADD COLUMN IF NOT EXISTS bracket_matchups JSONB;

-- =========================================================================
-- 2. Helper: merge a single participant's bracket votes into the aggregate
-- =========================================================================

CREATE OR REPLACE FUNCTION merge_bracket_matchups(
  p_existing JSONB,
  p_new_matchups JSONB  -- the "matchups" array from the participant's result
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_result JSONB;
  v_matchup JSONB;
  v_key TEXT;
  v_winner_ill TEXT;
  v_current_count INTEGER;
BEGIN
  v_result := COALESCE(p_existing, '{}'::jsonb);

  FOR v_matchup IN SELECT * FROM jsonb_array_elements(COALESCE(p_new_matchups, '[]'::jsonb))
  LOOP
    v_key := (v_matchup->>'round') || '-' || (v_matchup->>'match');
    v_winner_ill := v_matchup->>'winner_illustration_id';

    v_current_count := COALESCE((v_result->v_key->>v_winner_ill)::integer, 0);

    IF v_result ? v_key THEN
      v_result := jsonb_set(v_result, ARRAY[v_key, v_winner_ill], to_jsonb(v_current_count + 1));
    ELSE
      v_result := v_result || jsonb_build_object(v_key, jsonb_build_object(v_winner_ill, v_current_count + 1));
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- =========================================================================
-- 3. Extend record_daily_participation with a bracket branch
-- =========================================================================

CREATE OR REPLACE FUNCTION record_daily_participation(
  p_challenge_id INTEGER,
  p_session_id TEXT,
  p_user_id UUID,
  p_result JSONB
)
RETURNS TABLE (
  participation_count INTEGER,
  illustration_votes JSONB,
  side_a_votes INTEGER,
  side_b_votes INTEGER,
  champion_counts JSONB,
  avg_champion_wins REAL,
  max_champion_wins INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_challenge daily_challenges;
  v_already_exists BOOLEAN;
  v_winner_key TEXT;
  v_champion_wins_val INTEGER;
BEGIN
  -- Get the challenge
  SELECT * INTO v_challenge FROM daily_challenges WHERE id = p_challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found: %', p_challenge_id;
  END IF;

  -- Check if already participated
  SELECT EXISTS(
    SELECT 1 FROM daily_participations
    WHERE challenge_id = p_challenge_id AND session_id = p_session_id
  ) INTO v_already_exists;

  IF v_already_exists THEN
    RETURN QUERY
    SELECT s.participation_count, s.illustration_votes,
           s.side_a_votes, s.side_b_votes,
           s.champion_counts, s.avg_champion_wins, s.max_champion_wins
    FROM daily_challenge_stats s
    WHERE s.challenge_id = p_challenge_id;
    RETURN;
  END IF;

  -- Insert participation
  INSERT INTO daily_participations (challenge_id, session_id, user_id, result)
  VALUES (p_challenge_id, p_session_id, p_user_id, p_result)
  ON CONFLICT (challenge_id, session_id) DO NOTHING;

  -- Update stats based on challenge type
  IF v_challenge.challenge_type = 'remix' THEN
    v_winner_key := p_result->>'winner_illustration_id';
    UPDATE daily_challenge_stats SET
      participation_count = daily_challenge_stats.participation_count + 1,
      illustration_votes = COALESCE(daily_challenge_stats.illustration_votes, '{}'::jsonb) ||
        jsonb_build_object(v_winner_key,
          COALESCE((daily_challenge_stats.illustration_votes->>v_winner_key)::integer, 0) + 1),
      updated_at = NOW()
    WHERE challenge_id = p_challenge_id;

  ELSIF v_challenge.challenge_type = 'vs' THEN
    IF (p_result->>'winner') = 'a' THEN
      UPDATE daily_challenge_stats SET
        participation_count = daily_challenge_stats.participation_count + 1,
        side_a_votes = daily_challenge_stats.side_a_votes + 1,
        updated_at = NOW()
      WHERE challenge_id = p_challenge_id;
    ELSE
      UPDATE daily_challenge_stats SET
        participation_count = daily_challenge_stats.participation_count + 1,
        side_b_votes = daily_challenge_stats.side_b_votes + 1,
        updated_at = NOW()
      WHERE challenge_id = p_challenge_id;
    END IF;

  ELSIF v_challenge.challenge_type = 'gauntlet' THEN
    v_winner_key := p_result->>'champion_id';
    v_champion_wins_val := COALESCE((p_result->>'champion_wins')::integer, 0);
    UPDATE daily_challenge_stats SET
      participation_count = daily_challenge_stats.participation_count + 1,
      champion_counts = COALESCE(daily_challenge_stats.champion_counts, '{}'::jsonb) ||
        jsonb_build_object(v_winner_key,
          COALESCE((daily_challenge_stats.champion_counts->>v_winner_key)::integer, 0) + 1),
      max_champion_wins = GREATEST(daily_challenge_stats.max_champion_wins, v_champion_wins_val),
      avg_champion_wins = (
        COALESCE(daily_challenge_stats.avg_champion_wins, 0) * (daily_challenge_stats.participation_count - 1) + v_champion_wins_val
      )::real / daily_challenge_stats.participation_count,
      updated_at = NOW()
    WHERE challenge_id = p_challenge_id;

  ELSIF v_challenge.challenge_type = 'bracket' THEN
    -- Bracket: track champion + per-position matchup votes
    v_winner_key := p_result->>'champion_illustration_id';
    UPDATE daily_challenge_stats SET
      participation_count = daily_challenge_stats.participation_count + 1,
      champion_counts = COALESCE(daily_challenge_stats.champion_counts, '{}'::jsonb) ||
        jsonb_build_object(v_winner_key,
          COALESCE((daily_challenge_stats.champion_counts->>v_winner_key)::integer, 0) + 1),
      bracket_matchups = merge_bracket_matchups(daily_challenge_stats.bracket_matchups, p_result->'matchups'),
      updated_at = NOW()
    WHERE challenge_id = p_challenge_id;

  END IF;

  -- Return updated stats
  RETURN QUERY
  SELECT s.participation_count, s.illustration_votes,
         s.side_a_votes, s.side_b_votes,
         s.champion_counts, s.avg_champion_wins, s.max_champion_wins
  FROM daily_challenge_stats s
  WHERE s.challenge_id = p_challenge_id;
END;
$$;

-- =========================================================================
-- 4. Extend generate_daily_challenges to also create a bracket challenge
-- =========================================================================

CREATE OR REPLACE FUNCTION generate_daily_challenges(p_date DATE DEFAULT CURRENT_DATE)
RETURNS SETOF daily_challenges
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_count INTEGER;
  v_seed DOUBLE PRECISION;
  -- Gauntlet variables
  v_theme RECORD;
  v_gauntlet_pool JSONB;
  v_gauntlet_mode TEXT;
  v_gauntlet_title TEXT;
  v_gauntlet_description TEXT;
  v_gauntlet_preview RECORD;
  -- Bracket variables
  v_bracket_theme RECORD;
  v_bracket_pool JSONB;
  v_bracket_title TEXT;
  v_bracket_description TEXT;
  v_bracket_preview RECORD;
  v_bracket_size INTEGER := 16;
BEGIN
  -- Check if already generated (expect 2: gauntlet + bracket)
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
  -- A. Daily Gauntlet (existing logic, unchanged)
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
      v_gauntlet_mode := 'remix';
      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id, 'illustration_id', sub.illustration_id,
        'name', sub.name, 'slug', sub.slug, 'artist', sub.artist,
        'set_code', sub.set_code, 'set_name', sub.set_name,
        'collector_number', sub.collector_number, 'image_version', sub.image_version,
        'type_line', sub.type_line, 'mana_cost', sub.mana_cost
      )) INTO v_gauntlet_pool
      FROM (
        SELECT DISTINCT ON (p2.illustration_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version, oc.type_line, oc.mana_cost
        FROM printings p2
        JOIN sets s ON s.set_code = p2.set_code
        JOIN oracle_cards oc ON oc.oracle_id = p2.oracle_id
        WHERE p2.oracle_id = v_theme.oracle_id
          AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
        ORDER BY p2.illustration_id, s.released_at DESC
        LIMIT 10
      ) sub;
      SELECT v_theme.preview_set_code AS set_code, v_theme.preview_collector_number AS collector_number, v_theme.preview_image_version AS image_version INTO v_gauntlet_preview;

    ELSIF v_theme.theme_type = 'tribe' THEN
      v_gauntlet_mode := 'vs';
      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id, 'illustration_id', sub.illustration_id,
        'name', sub.name, 'slug', sub.slug, 'artist', sub.artist,
        'set_code', sub.set_code, 'set_name', sub.set_name,
        'collector_number', sub.collector_number, 'image_version', sub.image_version,
        'type_line', sub.type_line, 'mana_cost', sub.mana_cost
      )) INTO v_gauntlet_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version, oc.type_line, oc.mana_cost
        FROM oracle_cards oc
        JOIN printings p2 ON p2.oracle_id = oc.oracle_id
        JOIN sets s ON s.set_code = p2.set_code
        WHERE oc.type_line LIKE '%Creature%'
          AND oc.type_line LIKE '%—%'
          AND v_theme.tribe = ANY(string_to_array(trim(split_part(oc.type_line, '—', 2)), ' '))
          AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
        ORDER BY oc.oracle_id, random()
      ) sub ORDER BY random() LIMIT 10;
      SELECT v_gauntlet_pool->0->>'set_code' AS set_code, v_gauntlet_pool->0->>'collector_number' AS collector_number, v_gauntlet_pool->0->>'image_version' AS image_version INTO v_gauntlet_preview;

    ELSIF v_theme.theme_type = 'tag' THEN
      v_gauntlet_mode := 'vs';
      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id, 'illustration_id', sub.illustration_id,
        'name', sub.name, 'slug', sub.slug, 'artist', sub.artist,
        'set_code', sub.set_code, 'set_name', sub.set_name,
        'collector_number', sub.collector_number, 'image_version', sub.image_version,
        'type_line', sub.type_line, 'mana_cost', sub.mana_cost
      )) INTO v_gauntlet_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version, oc.type_line, oc.mana_cost
        FROM oracle_tags ot
        JOIN oracle_cards oc ON oc.oracle_id = ot.oracle_id
        JOIN printings p2 ON p2.oracle_id = oc.oracle_id
        JOIN sets s ON s.set_code = p2.set_code
        WHERE ot.tag_id = v_theme.tag_id
          AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
        ORDER BY oc.oracle_id, random()
      ) sub ORDER BY random() LIMIT 10;
      SELECT v_gauntlet_pool->0->>'set_code' AS set_code, v_gauntlet_pool->0->>'collector_number' AS collector_number, v_gauntlet_pool->0->>'image_version' AS image_version INTO v_gauntlet_preview;

    ELSIF v_theme.theme_type = 'artist' THEN
      v_gauntlet_mode := 'vs';
      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id, 'illustration_id', sub.illustration_id,
        'name', sub.name, 'slug', sub.slug, 'artist', sub.artist,
        'set_code', sub.set_code, 'set_name', sub.set_name,
        'collector_number', sub.collector_number, 'image_version', sub.image_version,
        'type_line', sub.type_line, 'mana_cost', sub.mana_cost
      )) INTO v_gauntlet_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version, oc.type_line, oc.mana_cost
        FROM printings p2
        JOIN sets s ON s.set_code = p2.set_code
        JOIN oracle_cards oc ON oc.oracle_id = p2.oracle_id
        WHERE p2.artist = v_theme.artist
          AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
        ORDER BY oc.oracle_id, s.released_at DESC
      ) sub ORDER BY random() LIMIT 10;
      IF v_theme.preview_set_code IS NOT NULL THEN
        SELECT v_theme.preview_set_code AS set_code, v_theme.preview_collector_number AS collector_number, v_theme.preview_image_version AS image_version INTO v_gauntlet_preview;
      ELSE
        SELECT v_gauntlet_pool->0->>'set_code' AS set_code, v_gauntlet_pool->0->>'collector_number' AS collector_number, v_gauntlet_pool->0->>'image_version' AS image_version INTO v_gauntlet_preview;
      END IF;

    ELSE
      v_gauntlet_mode := 'vs';
      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id, 'illustration_id', sub.illustration_id,
        'name', sub.name, 'slug', sub.slug, 'artist', sub.artist,
        'set_code', sub.set_code, 'set_name', sub.set_name,
        'collector_number', sub.collector_number, 'image_version', sub.image_version,
        'type_line', sub.type_line, 'mana_cost', sub.mana_cost
      )) INTO v_gauntlet_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version, oc.type_line, oc.mana_cost
        FROM oracle_cards oc
        JOIN printings p2 ON p2.oracle_id = oc.oracle_id
        JOIN sets s ON s.set_code = p2.set_code
        WHERE oc.type_line LIKE '%Creature%'
          AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
        ORDER BY oc.oracle_id, random()
      ) sub ORDER BY random() LIMIT 10;
      SELECT v_gauntlet_pool->0->>'set_code' AS set_code, v_gauntlet_pool->0->>'collector_number' AS collector_number, v_gauntlet_pool->0->>'image_version' AS image_version INTO v_gauntlet_preview;
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

  -- =========================================================================
  -- B. Daily Bracket: 16-card single-elimination art tournament
  -- =========================================================================

  -- Pick a theme suitable for brackets (>= 16 cards, exclude card_remix
  -- which typically has fewer illustrations than 16). Use a separate
  -- random() pick from the gauntlet so the two dailies can have different
  -- themes on the same day.
  SELECT * INTO v_bracket_theme
  FROM gauntlet_themes
  WHERE is_active = TRUE
    AND theme_type != 'card_remix'
    AND pool_size_estimate >= v_bracket_size
  ORDER BY random()
  LIMIT 1;

  IF FOUND THEN
    -- Strip " Gauntlet" / " Remix" suffix from theme labels (they're
    -- stored as "Nymph Gauntlet", "Dragon Gauntlet", etc.) before
    -- appending " Bracket".
    v_bracket_title := regexp_replace(v_bracket_theme.label, '\s+(Gauntlet|Remix)$', '') || ' Bracket';
    v_bracket_description := 'Daily 16-card single-elimination art bracket';

    IF v_bracket_theme.theme_type = 'tribe' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id, 'illustration_id', sub.illustration_id,
        'name', sub.name, 'slug', sub.slug, 'artist', sub.artist,
        'set_code', sub.set_code, 'set_name', sub.set_name,
        'collector_number', sub.collector_number, 'image_version', sub.image_version,
        'type_line', sub.type_line, 'mana_cost', sub.mana_cost
      )) INTO v_bracket_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version, oc.type_line, oc.mana_cost
        FROM oracle_cards oc
        JOIN printings p2 ON p2.oracle_id = oc.oracle_id
        JOIN sets s ON s.set_code = p2.set_code
        WHERE oc.type_line LIKE '%Creature%'
          AND oc.type_line LIKE '%—%'
          AND v_bracket_theme.tribe = ANY(string_to_array(trim(split_part(oc.type_line, '—', 2)), ' '))
          AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
        ORDER BY oc.oracle_id, random()
      ) sub ORDER BY random() LIMIT v_bracket_size;

    ELSIF v_bracket_theme.theme_type = 'tag' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id, 'illustration_id', sub.illustration_id,
        'name', sub.name, 'slug', sub.slug, 'artist', sub.artist,
        'set_code', sub.set_code, 'set_name', sub.set_name,
        'collector_number', sub.collector_number, 'image_version', sub.image_version,
        'type_line', sub.type_line, 'mana_cost', sub.mana_cost
      )) INTO v_bracket_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version, oc.type_line, oc.mana_cost
        FROM oracle_tags ot
        JOIN oracle_cards oc ON oc.oracle_id = ot.oracle_id
        JOIN printings p2 ON p2.oracle_id = oc.oracle_id
        JOIN sets s ON s.set_code = p2.set_code
        WHERE ot.tag_id = v_bracket_theme.tag_id
          AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
        ORDER BY oc.oracle_id, random()
      ) sub ORDER BY random() LIMIT v_bracket_size;

    ELSIF v_bracket_theme.theme_type = 'artist' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id, 'illustration_id', sub.illustration_id,
        'name', sub.name, 'slug', sub.slug, 'artist', sub.artist,
        'set_code', sub.set_code, 'set_name', sub.set_name,
        'collector_number', sub.collector_number, 'image_version', sub.image_version,
        'type_line', sub.type_line, 'mana_cost', sub.mana_cost
      )) INTO v_bracket_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version, oc.type_line, oc.mana_cost
        FROM printings p2
        JOIN sets s ON s.set_code = p2.set_code
        JOIN oracle_cards oc ON oc.oracle_id = p2.oracle_id
        WHERE p2.artist = v_bracket_theme.artist
          AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
        ORDER BY oc.oracle_id, s.released_at DESC
      ) sub ORDER BY random() LIMIT v_bracket_size;

    ELSIF v_bracket_theme.theme_type = 'set' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id, 'illustration_id', sub.illustration_id,
        'name', sub.name, 'slug', sub.slug, 'artist', sub.artist,
        'set_code', sub.set_code, 'set_name', sub.set_name,
        'collector_number', sub.collector_number, 'image_version', sub.image_version,
        'type_line', sub.type_line, 'mana_cost', sub.mana_cost
      )) INTO v_bracket_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version, oc.type_line, oc.mana_cost
        FROM printings p2
        JOIN sets s ON s.set_code = p2.set_code
        JOIN oracle_cards oc ON oc.oracle_id = p2.oracle_id
        WHERE p2.set_code = v_bracket_theme.set_code
          AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
        ORDER BY oc.oracle_id, s.released_at DESC
      ) sub ORDER BY random() LIMIT v_bracket_size;

    ELSE
      -- Fallback: random creatures
      SELECT jsonb_agg(jsonb_build_object(
        'oracle_id', sub.oracle_id, 'illustration_id', sub.illustration_id,
        'name', sub.name, 'slug', sub.slug, 'artist', sub.artist,
        'set_code', sub.set_code, 'set_name', sub.set_name,
        'collector_number', sub.collector_number, 'image_version', sub.image_version,
        'type_line', sub.type_line, 'mana_cost', sub.mana_cost
      )) INTO v_bracket_pool
      FROM (
        SELECT DISTINCT ON (oc.oracle_id)
          oc.oracle_id, p2.illustration_id, oc.name, oc.slug,
          p2.artist, p2.set_code, s.name AS set_name,
          p2.collector_number, p2.image_version, oc.type_line, oc.mana_cost
        FROM oracle_cards oc
        JOIN printings p2 ON p2.oracle_id = oc.oracle_id
        JOIN sets s ON s.set_code = p2.set_code
        WHERE oc.type_line LIKE '%Creature%'
          AND p2.illustration_id IS NOT NULL AND s.digital = FALSE
        ORDER BY oc.oracle_id, random()
      ) sub ORDER BY random() LIMIT v_bracket_size;
    END IF;

    -- Preview from theme or first pool entry
    IF v_bracket_theme.preview_set_code IS NOT NULL THEN
      SELECT v_bracket_theme.preview_set_code AS set_code, v_bracket_theme.preview_collector_number AS collector_number, v_bracket_theme.preview_image_version AS image_version INTO v_bracket_preview;
    ELSE
      SELECT v_bracket_pool->0->>'set_code' AS set_code, v_bracket_pool->0->>'collector_number' AS collector_number, v_bracket_pool->0->>'image_version' AS image_version INTO v_bracket_preview;
    END IF;

    INSERT INTO daily_challenges (
      challenge_date, challenge_type,
      pool, theme_id, bracket_size,
      title, description,
      preview_set_code, preview_collector_number, preview_image_version
    ) VALUES (
      p_date, 'bracket',
      v_bracket_pool, v_bracket_theme.id, v_bracket_size,
      v_bracket_title, v_bracket_description,
      v_bracket_preview.set_code, v_bracket_preview.collector_number, v_bracket_preview.image_version
    ) ON CONFLICT (challenge_date, challenge_type) DO NOTHING;
  END IF;

  -- Create empty stats rows for any new challenges
  INSERT INTO daily_challenge_stats (challenge_id)
  SELECT id FROM daily_challenges WHERE challenge_date = p_date
  ON CONFLICT (challenge_id) DO NOTHING;

  RETURN QUERY SELECT * FROM daily_challenges WHERE challenge_date = p_date;
END;
$$;
