-- Store completed gauntlet results (instead of individual votes)
-- Each row = one full gauntlet playthrough

CREATE TABLE IF NOT EXISTS gauntlet_results (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT NOT NULL,

  -- Gauntlet config
  mode TEXT NOT NULL CHECK (mode IN ('remix', 'vs')),
  pool_size INTEGER NOT NULL,

  -- Champion info
  champion_oracle_id UUID NOT NULL,
  champion_illustration_id UUID NOT NULL,
  champion_name TEXT NOT NULL,
  champion_wins INTEGER NOT NULL,

  -- Full results as JSONB array (ordered by elimination, last = champion)
  -- Each entry: { oracle_id, illustration_id, name, artist, set_code, collector_number, wins, position }
  results JSONB NOT NULL,

  -- Optional: link to daily challenge
  daily_challenge_id INTEGER REFERENCES daily_challenges(id),

  -- Context (what kind of gauntlet)
  card_name TEXT,        -- remix: the card name
  filter_label TEXT,     -- vs: the filter used (e.g. "Goblin")

  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user history queries
CREATE INDEX IF NOT EXISTS idx_gauntlet_results_user ON gauntlet_results(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gauntlet_results_session ON gauntlet_results(session_id);
CREATE INDEX IF NOT EXISTS idx_gauntlet_results_completed ON gauntlet_results(completed_at DESC);

-- RLS
ALTER TABLE gauntlet_results ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (anonymous or logged in)
CREATE POLICY "Anyone can insert gauntlet results"
  ON gauntlet_results FOR INSERT
  WITH CHECK (true);

-- Users can read their own results
CREATE POLICY "Users can read own gauntlet results"
  ON gauntlet_results FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do anything (for admin/API)
CREATE POLICY "Service role full access to gauntlet results"
  ON gauntlet_results FOR ALL
  USING (auth.role() = 'service_role');
