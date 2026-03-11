-- Card-level favorites (separate from illustration/art favorites)
-- Users can favorite a card (oracle_id) regardless of specific art

CREATE TABLE IF NOT EXISTS card_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  oracle_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, oracle_id)
);

CREATE INDEX IF NOT EXISTS idx_card_favorites_user ON card_favorites(user_id);

-- RLS
ALTER TABLE card_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own card favorites"
  ON card_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own card favorites"
  ON card_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own card favorites"
  ON card_favorites FOR DELETE
  USING (auth.uid() = user_id);
