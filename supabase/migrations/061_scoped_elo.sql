-- Add scope to art_ratings for scoped ELO (remix vs VS/gauntlet)
-- All existing ratings are remix (within-card art comparisons)

ALTER TABLE art_ratings ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'remix';
ALTER TABLE art_ratings DROP CONSTRAINT IF EXISTS art_ratings_pkey;
ALTER TABLE art_ratings ADD PRIMARY KEY (illustration_id, scope);

-- Update record_vote to support scoped ratings
DROP FUNCTION IF EXISTS record_vote(UUID, UUID, UUID, TEXT, UUID, TEXT, REAL);

CREATE OR REPLACE FUNCTION record_vote(
  p_oracle_id UUID,
  p_winner_illustration_id UUID,
  p_loser_illustration_id UUID,
  p_session_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_vote_source TEXT DEFAULT NULL,
  p_k_factor REAL DEFAULT NULL,
  p_scope TEXT DEFAULT 'remix'
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
  v_k := COALESCE(p_k_factor, CASE WHEN p_user_id IS NOT NULL THEN 32 ELSE 16 END);

  -- Ensure ratings exist for this scope
  INSERT INTO art_ratings (illustration_id, oracle_id, scope, elo_rating, vote_count, win_count, loss_count, updated_at)
  VALUES (p_winner_illustration_id, p_oracle_id, p_scope, 1500, 0, 0, 0, NOW())
  ON CONFLICT (illustration_id, scope) DO NOTHING;

  INSERT INTO art_ratings (illustration_id, oracle_id, scope, elo_rating, vote_count, win_count, loss_count, updated_at)
  VALUES (p_loser_illustration_id, p_oracle_id, p_scope, 1500, 0, 0, 0, NOW())
  ON CONFLICT (illustration_id, scope) DO NOTHING;

  -- Get current ratings for this scope
  SELECT elo_rating INTO v_winner_rating FROM art_ratings WHERE illustration_id = p_winner_illustration_id AND scope = p_scope;
  SELECT elo_rating INTO v_loser_rating FROM art_ratings WHERE illustration_id = p_loser_illustration_id AND scope = p_scope;

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
  WHERE illustration_id = p_winner_illustration_id AND scope = p_scope
  RETURNING vote_count, win_count, loss_count INTO v_w_count, v_w_win, v_w_loss;

  -- Update loser
  UPDATE art_ratings
  SET elo_rating = v_new_loser,
      vote_count = art_ratings.vote_count + 1,
      loss_count = art_ratings.loss_count + 1,
      updated_at = NOW()
  WHERE illustration_id = p_loser_illustration_id AND scope = p_scope
  RETURNING vote_count, win_count, loss_count INTO v_l_count, v_l_win, v_l_loss;

  -- Insert vote record
  INSERT INTO votes (oracle_id, winner_illustration_id, loser_illustration_id, session_id, user_id, vote_source, voted_at)
  VALUES (p_oracle_id, p_winner_illustration_id, p_loser_illustration_id, p_session_id, p_user_id, p_vote_source, NOW());

  RETURN QUERY SELECT
    p_winner_illustration_id, v_new_winner, v_w_count, v_w_win, v_w_loss,
    p_loser_illustration_id, v_new_loser, v_l_count, v_l_win, v_l_loss;
END;
$$;
