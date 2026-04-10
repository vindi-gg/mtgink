-- Batch process gauntlet matchups in a single DB call (19 round-trips → 1)
-- Accepts JSONB array of matchups, processes ELO updates sequentially within one transaction

CREATE OR REPLACE FUNCTION process_gauntlet_matchups(
  p_matchups JSONB,
  p_session_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_k_factor REAL DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_matchup JSONB;
  v_mode TEXT;
  v_k REAL;
  v_winner_rating REAL;
  v_loser_rating REAL;
  v_expected_winner REAL;
  v_new_winner REAL;
  v_new_loser REAL;
  -- remix fields
  v_oracle_id UUID;
  v_winner_ill UUID;
  v_loser_ill UUID;
  -- vs fields
  v_winner_oid UUID;
  v_loser_oid UUID;
BEGIN
  v_k := COALESCE(p_k_factor, CASE WHEN p_user_id IS NOT NULL THEN 32 ELSE 16 END);

  FOR v_matchup IN SELECT * FROM jsonb_array_elements(p_matchups)
  LOOP
    v_mode := v_matchup->>'mode';

    IF v_mode = 'remix' THEN
      v_oracle_id := (v_matchup->>'oracle_id')::UUID;
      v_winner_ill := (v_matchup->>'winner_illustration_id')::UUID;
      v_loser_ill := (v_matchup->>'loser_illustration_id')::UUID;

      IF v_oracle_id IS NULL OR v_winner_ill IS NULL OR v_loser_ill IS NULL THEN
        CONTINUE;
      END IF;

      -- Ensure ratings exist
      INSERT INTO art_ratings (illustration_id, oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
      VALUES (v_winner_ill, v_oracle_id, 1500, 0, 0, 0, NOW())
      ON CONFLICT (illustration_id) DO NOTHING;

      INSERT INTO art_ratings (illustration_id, oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
      VALUES (v_loser_ill, v_oracle_id, 1500, 0, 0, 0, NOW())
      ON CONFLICT (illustration_id) DO NOTHING;

      -- Get current ratings
      SELECT elo_rating INTO v_winner_rating FROM art_ratings WHERE illustration_id = v_winner_ill;
      SELECT elo_rating INTO v_loser_rating FROM art_ratings WHERE illustration_id = v_loser_ill;

      -- Calculate ELO
      v_expected_winner := 1.0 / (1.0 + POWER(10.0, (v_loser_rating - v_winner_rating) / 400.0));
      v_new_winner := v_winner_rating + v_k * (1.0 - v_expected_winner);
      v_new_loser := v_loser_rating + v_k * (0.0 - (1.0 - v_expected_winner));

      -- Update ratings
      UPDATE art_ratings SET elo_rating = v_new_winner, vote_count = vote_count + 1, win_count = win_count + 1, updated_at = NOW()
      WHERE illustration_id = v_winner_ill;

      UPDATE art_ratings SET elo_rating = v_new_loser, vote_count = vote_count + 1, loss_count = loss_count + 1, updated_at = NOW()
      WHERE illustration_id = v_loser_ill;

      -- Insert vote record
      INSERT INTO votes (oracle_id, winner_illustration_id, loser_illustration_id, session_id, user_id, vote_source, voted_at)
      VALUES (v_oracle_id, v_winner_ill, v_loser_ill, p_session_id, p_user_id, 'gauntlet_remix', NOW());

    ELSIF v_mode = 'vs' THEN
      v_winner_oid := (v_matchup->>'winner_oracle_id')::UUID;
      v_loser_oid := (v_matchup->>'loser_oracle_id')::UUID;

      IF v_winner_oid IS NULL OR v_loser_oid IS NULL THEN
        CONTINUE;
      END IF;

      -- Ensure ratings exist
      INSERT INTO card_ratings (oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
      VALUES (v_winner_oid, 1500, 0, 0, 0, NOW())
      ON CONFLICT (oracle_id) DO NOTHING;

      INSERT INTO card_ratings (oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
      VALUES (v_loser_oid, 1500, 0, 0, 0, NOW())
      ON CONFLICT (oracle_id) DO NOTHING;

      -- Get current ratings
      SELECT elo_rating INTO v_winner_rating FROM card_ratings WHERE oracle_id = v_winner_oid;
      SELECT elo_rating INTO v_loser_rating FROM card_ratings WHERE oracle_id = v_loser_oid;

      -- Calculate ELO
      v_expected_winner := 1.0 / (1.0 + POWER(10.0, (v_loser_rating - v_winner_rating) / 400.0));
      v_new_winner := v_winner_rating + v_k * (1.0 - v_expected_winner);
      v_new_loser := v_loser_rating + v_k * (0.0 - (1.0 - v_expected_winner));

      -- Update ratings
      UPDATE card_ratings SET elo_rating = v_new_winner, vote_count = vote_count + 1, win_count = win_count + 1, updated_at = NOW()
      WHERE oracle_id = v_winner_oid;

      UPDATE card_ratings SET elo_rating = v_new_loser, vote_count = vote_count + 1, loss_count = loss_count + 1, updated_at = NOW()
      WHERE oracle_id = v_loser_oid;

      -- Insert vote record
      INSERT INTO card_votes (winner_oracle_id, loser_oracle_id, session_id, user_id, vote_source, voted_at)
      VALUES (v_winner_oid, v_loser_oid, p_session_id, p_user_id, 'gauntlet_vs', NOW());
    END IF;
  END LOOP;
END;
$$;
