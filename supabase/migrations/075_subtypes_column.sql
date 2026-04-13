-- 075_subtypes_column.sql
-- Precomputed subtypes array on oracle_cards for fast tribe/subtype queries.
-- Replaces runtime split_part(type_line, '—', 2) parsing with a GIN-indexed
-- JSONB containment check: WHERE subtypes @> '["Rat"]'::jsonb

-- 1. Add the column
ALTER TABLE oracle_cards ADD COLUMN IF NOT EXISTS subtypes JSONB DEFAULT '[]'::jsonb;

-- 2. Backfill from type_line. Handles:
--    - Single-face: "Creature — Rat Ninja" → ["Rat", "Ninja"]
--    - Multi-face: "Creature — Human // Creature — Werewolf" → ["Human", "Werewolf"]
--    - No subtypes: "Instant" → []
--    - Subtypes on any face: "Land — Town // Sorcery — Adventure" → ["Town", "Adventure"]
UPDATE oracle_cards SET subtypes = (
  SELECT COALESCE(jsonb_agg(DISTINCT word), '[]'::jsonb)
  FROM (
    -- Split type_line by " // " to get each face, then extract subtypes
    SELECT unnest(string_to_array(
      trim(split_part(face, '—', 2)),
      ' '
    )) AS word
    FROM unnest(string_to_array(type_line, ' // ')) AS face
    WHERE face LIKE '%—%'
  ) sub
  WHERE word != '' AND word IS NOT NULL
);

-- 3. GIN index for fast @> containment queries
CREATE INDEX IF NOT EXISTS idx_oracle_cards_subtypes ON oracle_cards USING GIN (subtypes);

-- 4. Update get_random_cards to use the new column
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
    AND (p_subtype IS NULL OR o.subtypes @> jsonb_build_array(p_subtype))
    AND (p_rules_text IS NULL OR o.oracle_text ILIKE '%' || p_rules_text || '%')
  ORDER BY RANDOM() LIMIT p_count;
END;
$$;

-- 5. Update generate_daily_challenges tribe queries to use subtypes column
-- (The full proc is in 074 — we just need to replace the tribe WHERE clauses)
-- Re-create with the subtypes @> check instead of string splitting.
-- Note: This replaces the proc from 074.
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
  v_gauntlet_preview RECORD;
  v_bracket_theme RECORD;
  v_bracket_pool JSONB;
  v_bracket_title TEXT;
  v_bracket_description TEXT;
  v_bracket_preview RECORD;
  v_bracket_size INTEGER := 16;
BEGIN
  SELECT COUNT(*) INTO v_existing_count
  FROM daily_challenges WHERE challenge_date = p_date;

  IF v_existing_count >= 2 THEN
    RETURN QUERY SELECT * FROM daily_challenges WHERE challenge_date = p_date;
    RETURN;
  END IF;

  v_seed := abs(hashtext(p_date::text)) / 2147483647.0;
  PERFORM setseed(v_seed);

  -- =====================================================================
  -- A. Daily Gauntlet
  -- =====================================================================
  SELECT * INTO v_theme
  FROM gauntlet_themes
  WHERE is_active = TRUE
    AND theme_type = (
      SELECT theme_type FROM (
        SELECT DISTINCT theme_type FROM gauntlet_themes WHERE is_active = TRUE
      ) types ORDER BY random() LIMIT 1
    )
  ORDER BY random() LIMIT 1;

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
        ORDER BY p2.illustration_id, s.released_at DESC LIMIT 10
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
        WHERE oc.subtypes @> jsonb_build_array(v_theme.tribe)
          AND oc.type_line LIKE '%Creature%'
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

  -- =====================================================================
  -- B. Daily Bracket
  -- =====================================================================
  SELECT * INTO v_bracket_theme
  FROM gauntlet_themes
  WHERE is_active = TRUE
    AND theme_type != 'card_remix'
    AND pool_size_estimate >= v_bracket_size
  ORDER BY random() LIMIT 1;

  IF FOUND THEN
    v_bracket_title := regexp_replace(v_bracket_theme.label, '\s+(Gauntlet|Remix)$', '') || ' Bracket';
    v_bracket_description := 'Daily ' || v_bracket_size || '-card single-elimination art bracket';

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
        WHERE oc.subtypes @> jsonb_build_array(v_bracket_theme.tribe)
          AND oc.type_line LIKE '%Creature%'
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

  INSERT INTO daily_challenge_stats (challenge_id)
  SELECT id FROM daily_challenges WHERE challenge_date = p_date
  ON CONFLICT (challenge_id) DO NOTHING;

  RETURN QUERY SELECT * FROM daily_challenges WHERE challenge_date = p_date;
END;
$$;
