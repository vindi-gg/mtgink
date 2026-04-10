-- Giveaway entries table for tracking daily gauntlet completions during promotions
CREATE TABLE giveaway_entries (
  id SERIAL PRIMARY KEY,
  giveaway_id TEXT NOT NULL DEFAULT 'april-2026',
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  daily_challenge_id INT REFERENCES daily_challenges(id),
  gauntlet_result_id INT REFERENCES gauntlet_results(id),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(giveaway_id, session_id, daily_challenge_id)
);

CREATE INDEX idx_giveaway_entries_giveaway ON giveaway_entries(giveaway_id);

-- RLS: public insert (entries created server-side via admin client, but belt-and-suspenders)
ALTER TABLE giveaway_entries ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_all" ON giveaway_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can read their own entries
CREATE POLICY "users_read_own" ON giveaway_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
