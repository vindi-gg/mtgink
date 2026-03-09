-- Votes, ratings, favorites, decks (migrated from mtgink_votes.db SQLite)

CREATE TABLE IF NOT EXISTS art_ratings (
  illustration_id UUID PRIMARY KEY,
  oracle_id UUID NOT NULL,
  elo_rating REAL NOT NULL DEFAULT 1500,
  vote_count INTEGER NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  loss_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_art_ratings_oracle ON art_ratings(oracle_id);
CREATE INDEX idx_art_ratings_elo ON art_ratings(elo_rating DESC);

CREATE TABLE IF NOT EXISTS votes (
  id BIGSERIAL PRIMARY KEY,
  oracle_id UUID NOT NULL,
  winner_illustration_id UUID NOT NULL,
  loser_illustration_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  vote_source TEXT,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_votes_oracle ON votes(oracle_id);
CREATE INDEX idx_votes_session ON votes(session_id);
CREATE INDEX idx_votes_user ON votes(user_id);
CREATE INDEX idx_votes_source ON votes(vote_source);

CREATE TABLE IF NOT EXISTS favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id),
  illustration_id UUID NOT NULL,
  oracle_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, illustration_id)
);

CREATE INDEX idx_favorites_user ON favorites(user_id);

CREATE TABLE IF NOT EXISTS decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  format TEXT,
  source_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_decks_user ON decks(user_id);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  oracle_id UUID NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  section TEXT NOT NULL DEFAULT 'Mainboard',
  selected_illustration_id UUID,
  to_buy BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (deck_id, oracle_id)
);

CREATE INDEX idx_deck_cards_deck ON deck_cards(deck_id);

CREATE TABLE IF NOT EXISTS popularity_signals (
  illustration_id UUID NOT NULL,
  source TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  value REAL NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (illustration_id, source, signal_type)
);
