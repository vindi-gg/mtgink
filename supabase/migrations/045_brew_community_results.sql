-- Add brew_id to gauntlet_results for tracking brew community results
ALTER TABLE gauntlet_results ADD COLUMN IF NOT EXISTS brew_id UUID REFERENCES brews(id) ON DELETE SET NULL;

-- Index for querying results by brew
CREATE INDEX IF NOT EXISTS idx_gauntlet_results_brew ON gauntlet_results(brew_id) WHERE brew_id IS NOT NULL;

-- Allow public read of brew results (so anyone can see community stats)
CREATE POLICY "Anyone can read brew gauntlet results"
  ON gauntlet_results FOR SELECT
  USING (brew_id IS NOT NULL);
