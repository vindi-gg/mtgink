-- Boost/reduce ELO for an illustration (used by favorites)
CREATE OR REPLACE FUNCTION boost_elo(
  p_illustration_id UUID,
  p_oracle_id UUID,
  p_scope TEXT DEFAULT 'remix',
  p_boost REAL DEFAULT 25
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO art_ratings (illustration_id, oracle_id, scope, elo_rating, vote_count, win_count, loss_count, updated_at)
  VALUES (p_illustration_id, p_oracle_id, p_scope, 1500 + p_boost, 1, 1, 0, NOW())
  ON CONFLICT (illustration_id, scope) DO UPDATE SET
    elo_rating = art_ratings.elo_rating + p_boost,
    vote_count = art_ratings.vote_count + 1,
    win_count = art_ratings.win_count + 1,
    updated_at = NOW();
END;
$$;
