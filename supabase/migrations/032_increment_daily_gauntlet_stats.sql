-- RPC to atomically update daily_challenge_stats when a gauntlet is completed
CREATE OR REPLACE FUNCTION increment_daily_gauntlet_stats(
  p_challenge_id INTEGER,
  p_champion_id TEXT,
  p_champion_wins INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_count INTEGER;
  v_current_avg REAL;
BEGIN
  -- Get current values
  SELECT participation_count, COALESCE(avg_champion_wins, 0)
  INTO v_current_count, v_current_avg
  FROM daily_challenge_stats
  WHERE challenge_id = p_challenge_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE daily_challenge_stats SET
    participation_count = v_current_count + 1,
    champion_counts = COALESCE(champion_counts, '{}'::jsonb) ||
      jsonb_build_object(p_champion_id,
        COALESCE((champion_counts ->> p_champion_id)::integer, 0) + 1),
    avg_champion_wins = (v_current_avg * v_current_count + p_champion_wins) / (v_current_count + 1),
    max_champion_wins = GREATEST(COALESCE(max_champion_wins, 0), p_champion_wins),
    updated_at = NOW()
  WHERE challenge_id = p_challenge_id;
END;
$$;
