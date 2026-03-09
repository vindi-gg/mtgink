-- Stored procedures for complex queries

-- Get illustrations for a card (replaces correlated subquery in queries.ts)
CREATE OR REPLACE FUNCTION get_illustrations_for_card(p_oracle_id UUID)
RETURNS TABLE (
  illustration_id UUID,
  oracle_id UUID,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    p.illustration_id,
    p.oracle_id,
    p.artist,
    p.set_code,
    s.name AS set_name,
    p.collector_number,
    p.released_at
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
  ORDER BY p.released_at ASC;
$$;

-- Record a vote atomically (ELO update + vote insert)
CREATE OR REPLACE FUNCTION record_vote(
  p_oracle_id UUID,
  p_winner_illustration_id UUID,
  p_loser_illustration_id UUID,
  p_session_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_vote_source TEXT DEFAULT NULL
)
RETURNS TABLE (
  winner_illustration_id UUID,
  winner_elo REAL,
  winner_vote_count INTEGER,
  winner_win_count INTEGER,
  winner_loss_count INTEGER,
  loser_illustration_id UUID,
  loser_elo REAL,
  loser_vote_count INTEGER,
  loser_win_count INTEGER,
  loser_loss_count INTEGER
) LANGUAGE plpgsql AS $$
DECLARE
  v_winner_rating REAL;
  v_loser_rating REAL;
  v_expected_winner REAL;
  v_k REAL;
  v_new_winner REAL;
  v_new_loser REAL;
  v_w_count INTEGER;
  v_w_win INTEGER;
  v_w_loss INTEGER;
  v_l_count INTEGER;
  v_l_win INTEGER;
  v_l_loss INTEGER;
BEGIN
  -- K factor: 32 for authenticated, 16 for anonymous
  v_k := CASE WHEN p_user_id IS NOT NULL THEN 32 ELSE 16 END;

  -- Ensure ratings exist
  INSERT INTO art_ratings (illustration_id, oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
  VALUES (p_winner_illustration_id, p_oracle_id, 1500, 0, 0, 0, NOW())
  ON CONFLICT (illustration_id) DO NOTHING;

  INSERT INTO art_ratings (illustration_id, oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
  VALUES (p_loser_illustration_id, p_oracle_id, 1500, 0, 0, 0, NOW())
  ON CONFLICT (illustration_id) DO NOTHING;

  -- Get current ratings
  SELECT elo_rating INTO v_winner_rating FROM art_ratings WHERE illustration_id = p_winner_illustration_id;
  SELECT elo_rating INTO v_loser_rating FROM art_ratings WHERE illustration_id = p_loser_illustration_id;

  -- Calculate ELO
  v_expected_winner := 1.0 / (1.0 + POWER(10.0, (v_loser_rating - v_winner_rating) / 400.0));
  v_new_winner := v_winner_rating + v_k * (1.0 - v_expected_winner);
  v_new_loser := v_loser_rating + v_k * (0.0 - (1.0 - v_expected_winner));

  -- Update winner
  UPDATE art_ratings
  SET elo_rating = v_new_winner,
      vote_count = art_ratings.vote_count + 1,
      win_count = art_ratings.win_count + 1,
      updated_at = NOW()
  WHERE illustration_id = p_winner_illustration_id
  RETURNING vote_count, win_count, loss_count INTO v_w_count, v_w_win, v_w_loss;

  -- Update loser
  UPDATE art_ratings
  SET elo_rating = v_new_loser,
      vote_count = art_ratings.vote_count + 1,
      loss_count = art_ratings.loss_count + 1,
      updated_at = NOW()
  WHERE illustration_id = p_loser_illustration_id
  RETURNING vote_count, win_count, loss_count INTO v_l_count, v_l_win, v_l_loss;

  -- Insert vote record
  INSERT INTO votes (oracle_id, winner_illustration_id, loser_illustration_id, session_id, user_id, vote_source, voted_at)
  VALUES (p_oracle_id, p_winner_illustration_id, p_loser_illustration_id, p_session_id, p_user_id, p_vote_source, NOW());

  RETURN QUERY SELECT
    p_winner_illustration_id, v_new_winner, v_w_count, v_w_win, v_w_loss,
    p_loser_illustration_id, v_new_loser, v_l_count, v_l_win, v_l_loss;
END;
$$;

-- Get random bracket cards
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
  illustration_id UUID
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
    p.illustration_id
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

-- Get a comparison pair: two random illustrations for a card WITH their ratings, in one call
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
  loss_count INTEGER
) LANGUAGE sql STABLE AS $$
  WITH ills AS (
    SELECT
      p.illustration_id,
      p.oracle_id,
      p.artist,
      p.set_code,
      s.name AS set_name,
      p.collector_number,
      p.released_at
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
    ar.loss_count
  FROM ills i
  LEFT JOIN art_ratings ar ON ar.illustration_id = i.illustration_id
  ORDER BY RANDOM()
  LIMIT 2;
$$;

-- Get a cross-card comparison pair: one random illustration from each of two cards WITH ratings
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
  loss_count INTEGER
) LANGUAGE sql STABLE AS $$
    WITH ills AS (
      SELECT
        p.illustration_id,
        p.oracle_id,
        p.artist,
        p.set_code,
        s.name AS set_name,
        p.collector_number,
        p.released_at
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
      ar.loss_count
    FROM picks pk
    LEFT JOIN art_ratings ar ON ar.illustration_id = pk.illustration_id;
$$;

-- Card cache: bulk load for in-memory JS cache
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
  illustration_count BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT
    o.oracle_id,
    o.name,
    o.slug,
    o.layout,
    o.type_line,
    o.mana_cost,
    o.colors,
    o.cmc,
    (SELECT COUNT(DISTINCT p.illustration_id)
     FROM printings p
     WHERE p.oracle_id = o.oracle_id AND p.illustration_id IS NOT NULL) AS illustration_count
  FROM oracle_cards o
  WHERE (SELECT COUNT(DISTINCT p.illustration_id)
         FROM printings p
         WHERE p.oracle_id = o.oracle_id AND p.illustration_id IS NOT NULL) >= 1;
$$;
