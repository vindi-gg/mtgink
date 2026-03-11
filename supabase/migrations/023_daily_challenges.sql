-- Daily Challenges: tables, indexes, RLS, and stored procedures

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE daily_challenges (
  id SERIAL PRIMARY KEY,
  challenge_date DATE NOT NULL,
  challenge_type TEXT NOT NULL,  -- 'remix' | 'vs' | 'gauntlet'

  -- Remix: card with 5+ illustrations
  oracle_id UUID,

  -- VS: two specific cards with chosen illustrations
  oracle_id_a UUID,
  oracle_id_b UUID,
  illustration_id_a UUID,
  illustration_id_b UUID,

  -- Gauntlet: fixed pool as JSONB array
  pool JSONB,
  gauntlet_mode TEXT,  -- 'remix' | 'vs'

  -- Display metadata
  title TEXT NOT NULL,
  description TEXT,
  preview_set_code TEXT,
  preview_collector_number TEXT,
  preview_image_version TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (challenge_date, challenge_type)
);

CREATE TABLE daily_participations (
  id BIGSERIAL PRIMARY KEY,
  challenge_id INTEGER REFERENCES daily_challenges(id),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  result JSONB NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (challenge_id, session_id)
);

CREATE TABLE daily_challenge_stats (
  challenge_id INTEGER PRIMARY KEY REFERENCES daily_challenges(id),
  participation_count INTEGER DEFAULT 0,
  illustration_votes JSONB,
  side_a_votes INTEGER DEFAULT 0,
  side_b_votes INTEGER DEFAULT 0,
  champion_counts JSONB,
  avg_champion_wins REAL,
  max_champion_wins INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_daily_challenges_date ON daily_challenges(challenge_date);
CREATE INDEX idx_daily_participations_challenge ON daily_participations(challenge_id);
CREATE INDEX idx_daily_participations_session ON daily_participations(session_id);
CREATE INDEX idx_daily_participations_user ON daily_participations(user_id) WHERE user_id IS NOT NULL;

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_challenge_stats ENABLE ROW LEVEL SECURITY;

-- daily_challenges: public read, service_role write
CREATE POLICY "daily_challenges_public_read" ON daily_challenges
  FOR SELECT USING (true);

-- daily_participations: anyone inserts, users read own
CREATE POLICY "daily_participations_insert" ON daily_participations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "daily_participations_read_own" ON daily_participations
  FOR SELECT USING (
    session_id = current_setting('request.headers', true)::json->>'x-session-id'
    OR user_id = auth.uid()
  );

-- daily_challenge_stats: public read
CREATE POLICY "daily_challenge_stats_public_read" ON daily_challenge_stats
  FOR SELECT USING (true);

-- =============================================================================
-- generate_daily_challenges(p_date DATE)
-- Idempotent: returns existing rows if already generated for that date
-- Deterministic: uses setseed so same date always picks same cards
-- =============================================================================

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

    -- Build pool from illustrations
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
    -- VS gauntlet: 10 random cards
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

-- =============================================================================
-- record_daily_participation(...)
-- Upserts participation and atomically updates stats
-- =============================================================================

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
    -- Return current stats without updating
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
      participation_count = participation_count + 1,
      illustration_votes = COALESCE(illustration_votes, '{}'::jsonb) ||
        jsonb_build_object(v_winner_key,
          COALESCE((illustration_votes->>v_winner_key)::integer, 0) + 1),
      updated_at = NOW()
    WHERE challenge_id = p_challenge_id;

  ELSIF v_challenge.challenge_type = 'vs' THEN
    IF (p_result->>'winner') = 'a' THEN
      UPDATE daily_challenge_stats SET
        participation_count = participation_count + 1,
        side_a_votes = side_a_votes + 1,
        updated_at = NOW()
      WHERE challenge_id = p_challenge_id;
    ELSE
      UPDATE daily_challenge_stats SET
        participation_count = participation_count + 1,
        side_b_votes = side_b_votes + 1,
        updated_at = NOW()
      WHERE challenge_id = p_challenge_id;
    END IF;

  ELSIF v_challenge.challenge_type = 'gauntlet' THEN
    v_winner_key := p_result->>'champion_id';
    v_champion_wins_val := COALESCE((p_result->>'champion_wins')::integer, 0);
    UPDATE daily_challenge_stats SET
      participation_count = participation_count + 1,
      champion_counts = COALESCE(champion_counts, '{}'::jsonb) ||
        jsonb_build_object(v_winner_key,
          COALESCE((champion_counts->>v_winner_key)::integer, 0) + 1),
      max_champion_wins = GREATEST(max_champion_wins, v_champion_wins_val),
      avg_champion_wins = (
        COALESCE(avg_champion_wins, 0) * (participation_count - 1) + v_champion_wins_val
      )::real / participation_count,
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
