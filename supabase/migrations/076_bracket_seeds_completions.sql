-- 076_bracket_seeds_completions.sql
-- Bracket seeds (shareable bracket configurations) and completions
-- (full bracket results for sharing). Seeds use a flexible JSONB params
-- column that can represent any source type (theme, expansion, tag,
-- artist, brew, all-with-filters).

-- =========================================================================
-- 1. bracket_seeds — shareable bracket configurations
-- =========================================================================

CREATE TABLE IF NOT EXISTS bracket_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Flexible source params: { source, sourceId, colors, ... }
  -- Whatever resolveBrewPool() needs to reproduce the pool.
  params JSONB NOT NULL,
  label TEXT NOT NULL,
  bracket_size INTEGER NOT NULL CHECK (bracket_size >= 2 AND bracket_size <= 1024),
  seed TEXT NOT NULL,
  -- Resolved BracketCard[] cached at creation time. The pool is baked
  -- so the bracket is always deterministic regardless of future data changes.
  pool JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  play_count INTEGER NOT NULL DEFAULT 0
);

-- Dedup: same params + size + seed = same bracket. Uses md5 hash of
-- the params JSONB text to keep the index compact.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bracket_seeds_dedup
  ON bracket_seeds(bracket_size, seed, md5(params::text));

CREATE INDEX IF NOT EXISTS idx_bracket_seeds_created
  ON bracket_seeds(created_at DESC);

ALTER TABLE bracket_seeds ENABLE ROW LEVEL SECURITY;

-- Anyone can read seeds (needed for shared play links).
DROP POLICY IF EXISTS "bracket_seeds_public_read" ON bracket_seeds;
CREATE POLICY "bracket_seeds_public_read"
  ON bracket_seeds FOR SELECT USING (true);

-- Service role writes via getAdminClient() in API routes.
-- No user-facing INSERT policy needed.

-- =========================================================================
-- 2. bracket_completions — full bracket results for sharing
-- =========================================================================

CREATE TABLE IF NOT EXISTS bracket_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_id UUID NOT NULL REFERENCES bracket_seeds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  champion_illustration_id UUID NOT NULL,
  champion_name TEXT NOT NULL,
  -- Full BracketState JSONB with all cards, rounds, and matchup winners.
  -- Enables read-only rendering of the completed bracket at /bracket/results/[id].
  bracket_state JSONB NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Who else played this bracket?"
CREATE INDEX IF NOT EXISTS idx_bracket_completions_seed
  ON bracket_completions(seed_id, completed_at DESC);

-- "My completed brackets" (for My Brackets page)
CREATE INDEX IF NOT EXISTS idx_bracket_completions_user
  ON bracket_completions(user_id, completed_at DESC);

ALTER TABLE bracket_completions ENABLE ROW LEVEL SECURITY;

-- Anyone can read completions (needed for shared results links).
DROP POLICY IF EXISTS "bracket_completions_public_read" ON bracket_completions;
CREATE POLICY "bracket_completions_public_read"
  ON bracket_completions FOR SELECT USING (true);

-- Users can insert their own completions.
DROP POLICY IF EXISTS "bracket_completions_user_insert" ON bracket_completions;
CREATE POLICY "bracket_completions_user_insert"
  ON bracket_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =========================================================================
-- 3. Helper: increment play count atomically
-- =========================================================================

-- Link saved_brackets to seeds/completions for shareable URLs in My Brackets
ALTER TABLE saved_brackets ADD COLUMN IF NOT EXISTS seed_id UUID REFERENCES bracket_seeds(id) ON DELETE SET NULL;
ALTER TABLE saved_brackets ADD COLUMN IF NOT EXISTS completion_id UUID REFERENCES bracket_completions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION increment_bracket_seed_play_count(p_seed_id UUID)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bracket_seeds SET play_count = play_count + 1 WHERE id = p_seed_id;
END;
$$;
