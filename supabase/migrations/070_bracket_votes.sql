-- Batch process bracket matchups in a single DB call.
-- Bracket votes are cross-card art votes: each matchup has two different cards,
-- and the winner is the illustration the user preferred. ELO is updated at the
-- illustration (art_ratings) level only.
--
-- Matchups are processed sequentially, so later rounds see the ELO effects of
-- earlier rounds within the same bracket.

CREATE OR REPLACE FUNCTION process_bracket_matchups(
  p_matchups JSONB,
  p_session_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_k_factor REAL DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_matchup JSONB;
  v_k REAL;
  v_winner_rating REAL;
  v_loser_rating REAL;
  v_expected_winner REAL;
  v_new_winner REAL;
  v_new_loser REAL;
  v_winner_ill UUID;
  v_loser_ill UUID;
  v_winner_oid UUID;
  v_loser_oid UUID;
BEGIN
  v_k := COALESCE(p_k_factor, CASE WHEN p_user_id IS NOT NULL THEN 32 ELSE 16 END);

  FOR v_matchup IN SELECT * FROM jsonb_array_elements(p_matchups)
  LOOP
    v_winner_ill := (v_matchup->>'winner_illustration_id')::UUID;
    v_loser_ill  := (v_matchup->>'loser_illustration_id')::UUID;
    v_winner_oid := (v_matchup->>'winner_oracle_id')::UUID;
    v_loser_oid  := (v_matchup->>'loser_oracle_id')::UUID;

    IF v_winner_ill IS NULL OR v_loser_ill IS NULL OR v_winner_oid IS NULL OR v_loser_oid IS NULL THEN
      CONTINUE;
    END IF;

    -- Ensure art_ratings rows exist for both illustrations (with their correct oracle_id)
    INSERT INTO art_ratings (illustration_id, oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
    VALUES (v_winner_ill, v_winner_oid, 1500, 0, 0, 0, NOW())
    ON CONFLICT (illustration_id) DO NOTHING;

    INSERT INTO art_ratings (illustration_id, oracle_id, elo_rating, vote_count, win_count, loss_count, updated_at)
    VALUES (v_loser_ill, v_loser_oid, 1500, 0, 0, 0, NOW())
    ON CONFLICT (illustration_id) DO NOTHING;

    -- Read the (possibly just-updated) ratings
    SELECT elo_rating INTO v_winner_rating FROM art_ratings WHERE illustration_id = v_winner_ill;
    SELECT elo_rating INTO v_loser_rating  FROM art_ratings WHERE illustration_id = v_loser_ill;

    -- ELO update
    v_expected_winner := 1.0 / (1.0 + POWER(10.0, (v_loser_rating - v_winner_rating) / 400.0));
    v_new_winner := v_winner_rating + v_k * (1.0 - v_expected_winner);
    v_new_loser  := v_loser_rating  + v_k * (0.0 - (1.0 - v_expected_winner));

    UPDATE art_ratings
      SET elo_rating = v_new_winner,
          vote_count = vote_count + 1,
          win_count  = win_count + 1,
          updated_at = NOW()
      WHERE illustration_id = v_winner_ill;

    UPDATE art_ratings
      SET elo_rating = v_new_loser,
          vote_count = vote_count + 1,
          loss_count = loss_count + 1,
          updated_at = NOW()
      WHERE illustration_id = v_loser_ill;

    -- Log the vote. The votes table has a single oracle_id column (legacy from
    -- same-card voting). For bracket votes we store the winner's oracle_id —
    -- vote_source='bracket' signals that winner and loser may be different cards.
    INSERT INTO votes (oracle_id, winner_illustration_id, loser_illustration_id, session_id, user_id, vote_source, voted_at)
    VALUES (v_winner_oid, v_winner_ill, v_loser_ill, p_session_id, p_user_id, 'bracket', NOW());
  END LOOP;
END;
$$;
