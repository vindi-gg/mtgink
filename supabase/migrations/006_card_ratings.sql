-- Card-level ratings and votes for Clash mode (comparing cards, not art)

CREATE TABLE card_ratings (
  oracle_id UUID PRIMARY KEY REFERENCES oracle_cards(oracle_id),
  elo_rating REAL NOT NULL DEFAULT 1500,
  vote_count INTEGER NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  loss_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_card_ratings_elo ON card_ratings(elo_rating DESC);

CREATE TABLE card_votes (
  id BIGSERIAL PRIMARY KEY,
  winner_oracle_id UUID NOT NULL REFERENCES oracle_cards(oracle_id),
  loser_oracle_id UUID NOT NULL REFERENCES oracle_cards(oracle_id),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  vote_source TEXT,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_card_votes_session ON card_votes(session_id);
CREATE INDEX idx_card_votes_user ON card_votes(user_id);
CREATE INDEX idx_card_votes_winner ON card_votes(winner_oracle_id);
CREATE INDEX idx_card_votes_loser ON card_votes(loser_oracle_id);

-- RLS
ALTER TABLE card_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read card_ratings" ON card_ratings FOR SELECT USING (true);
CREATE POLICY "Service role write card_ratings" ON card_ratings FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Anyone can insert card_votes" ON card_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users read own card_votes" ON card_votes FOR SELECT USING (
  session_id = current_setting('request.headers', true)::json->>'x-session-id'
  OR user_id = auth.uid()
);

-- Record a card-level vote atomically (ELO update + vote insert)
CREATE OR REPLACE FUNCTION record_card_vote(
  p_winner_oracle_id UUID,
  p_loser_oracle_id UUID,
  p_session_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_vote_source TEXT DEFAULT NULL
)
RETURNS TABLE (
  winner_oracle_id UUID,
  winner_elo REAL,
  winner_vote_count INTEGER,
  winner_win_count INTEGER,
  winner_loss_count INTEGER,
  loser_oracle_id UUID,
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
  v_k := CASE WHEN p_user_id IS NOT NULL THEN 32 ELSE 16 END;

  -- Ensure ratings exist
  INSERT INTO card_ratings (oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
  VALUES (p_winner_oracle_id, 1500, 0, 0, 0, NOW())
  ON CONFLICT (oracle_id) DO NOTHING;

  INSERT INTO card_ratings (oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
  VALUES (p_loser_oracle_id, 1500, 0, 0, 0, NOW())
  ON CONFLICT (oracle_id) DO NOTHING;

  -- Get current ratings
  SELECT elo_rating INTO v_winner_rating FROM card_ratings WHERE oracle_id = p_winner_oracle_id;
  SELECT elo_rating INTO v_loser_rating FROM card_ratings WHERE oracle_id = p_loser_oracle_id;

  -- Calculate ELO
  v_expected_winner := 1.0 / (1.0 + POWER(10.0, (v_loser_rating - v_winner_rating) / 400.0));
  v_new_winner := v_winner_rating + v_k * (1.0 - v_expected_winner);
  v_new_loser := v_loser_rating + v_k * (0.0 - (1.0 - v_expected_winner));

  -- Update winner
  UPDATE card_ratings
  SET elo_rating = v_new_winner,
      vote_count = card_ratings.vote_count + 1,
      win_count = card_ratings.win_count + 1,
      updated_at = NOW()
  WHERE oracle_id = p_winner_oracle_id
  RETURNING vote_count, win_count, loss_count INTO v_w_count, v_w_win, v_w_loss;

  -- Update loser
  UPDATE card_ratings
  SET elo_rating = v_new_loser,
      vote_count = card_ratings.vote_count + 1,
      loss_count = card_ratings.loss_count + 1,
      updated_at = NOW()
  WHERE oracle_id = p_loser_oracle_id
  RETURNING vote_count, win_count, loss_count INTO v_l_count, v_l_win, v_l_loss;

  -- Insert vote record
  INSERT INTO card_votes (winner_oracle_id, loser_oracle_id, session_id, user_id, vote_source, voted_at)
  VALUES (p_winner_oracle_id, p_loser_oracle_id, p_session_id, p_user_id, p_vote_source, NOW());

  RETURN QUERY SELECT
    p_winner_oracle_id, v_new_winner, v_w_count, v_w_win, v_w_loss,
    p_loser_oracle_id, v_new_loser, v_l_count, v_l_win, v_l_loss;
END;
$$;

-- Get a clash pair: two cards with representative printings and their card-level ratings
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
  loss_count INTEGER
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
      p.illustration_id
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
    cr.loss_count
  FROM cards c
  LEFT JOIN card_ratings cr ON cr.oracle_id = c.oracle_id;
$$;
