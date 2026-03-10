-- Add p_k_factor parameter to record_vote and record_card_vote
-- Allows the application to pass a computed K factor (from vote protection / spam prevention)

-- Art-level vote
CREATE OR REPLACE FUNCTION record_vote(
  p_oracle_id UUID,
  p_winner_illustration_id UUID,
  p_loser_illustration_id UUID,
  p_session_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_vote_source TEXT DEFAULT NULL,
  p_k_factor REAL DEFAULT NULL
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
  -- Use provided K factor, or fall back to auth-based default
  v_k := COALESCE(p_k_factor, CASE WHEN p_user_id IS NOT NULL THEN 32 ELSE 16 END);

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

-- Card-level vote
CREATE OR REPLACE FUNCTION record_card_vote(
  p_winner_oracle_id UUID,
  p_loser_oracle_id UUID,
  p_session_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_vote_source TEXT DEFAULT NULL,
  p_k_factor REAL DEFAULT NULL
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
  v_k := COALESCE(p_k_factor, CASE WHEN p_user_id IS NOT NULL THEN 32 ELSE 16 END);

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
