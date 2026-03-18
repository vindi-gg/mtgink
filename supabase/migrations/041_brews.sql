CREATE TABLE brews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('remix', 'vs', 'gauntlet')),
  source TEXT NOT NULL CHECK (source IN ('card', 'expansion', 'tribe', 'tag', 'artist')),
  source_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  colors TEXT[],
  card_type TEXT,
  pool_size INTEGER CHECK (pool_size IS NULL OR (pool_size >= 3 AND pool_size <= 50)),
  is_public BOOLEAN DEFAULT TRUE,
  play_count INTEGER DEFAULT 0,
  slug TEXT UNIQUE NOT NULL,
  preview_set_code TEXT,
  preview_collector_number TEXT,
  preview_image_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brews_slug ON brews(slug);
CREATE INDEX idx_brews_user_id ON brews(user_id);
CREATE INDEX idx_brews_public_popular ON brews(is_public, play_count DESC);
CREATE INDEX idx_brews_public_newest ON brews(is_public, created_at DESC);

ALTER TABLE brews ENABLE ROW LEVEL SECURITY;

-- Public brews readable by all
CREATE POLICY "Public brews readable" ON brews FOR SELECT USING (is_public = true);
-- Users read own brews (including private)
CREATE POLICY "Own brews readable" ON brews FOR SELECT USING (auth.uid() = user_id);
-- Users update own brews
CREATE POLICY "Own brews updatable" ON brews FOR UPDATE USING (auth.uid() = user_id);
-- Users delete own brews
CREATE POLICY "Own brews deletable" ON brews FOR DELETE USING (auth.uid() = user_id);

-- Atomic play count increment (SECURITY DEFINER so anyone can call)
CREATE OR REPLACE FUNCTION increment_brew_play_count(p_brew_id UUID)
RETURNS void AS $$
  UPDATE brews SET play_count = play_count + 1 WHERE id = p_brew_id;
$$ LANGUAGE sql SECURITY DEFINER;
