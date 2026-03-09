-- Row Level Security policies

-- Card data: public read
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read sets" ON sets FOR SELECT USING (true);

ALTER TABLE oracle_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read oracle_cards" ON oracle_cards FOR SELECT USING (true);

ALTER TABLE printings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read printings" ON printings FOR SELECT USING (true);

ALTER TABLE card_faces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read card_faces" ON card_faces FOR SELECT USING (true);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tags" ON tags FOR SELECT USING (true);

ALTER TABLE illustration_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read illustration_tags" ON illustration_tags FOR SELECT USING (true);

ALTER TABLE oracle_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read oracle_tags" ON oracle_tags FOR SELECT USING (true);

-- Prices: public read
ALTER TABLE marketplaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read marketplaces" ON marketplaces FOR SELECT USING (true);

ALTER TABLE prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read prices" ON prices FOR SELECT USING (true);

-- Art ratings: public read, service_role write
ALTER TABLE art_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read art_ratings" ON art_ratings FOR SELECT USING (true);

-- Votes: anyone can insert (anonymous voting), users read own
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert votes" ON votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users read own votes" ON votes FOR SELECT USING (auth.uid() = user_id);

-- Favorites: user-scoped
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own favorites" ON favorites
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Decks: user-scoped + public read
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own decks" ON decks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public read public decks" ON decks
  FOR SELECT USING (is_public = TRUE);

-- Deck cards: user-scoped via deck ownership
ALTER TABLE deck_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own deck cards" ON deck_cards
  FOR ALL USING (
    EXISTS (SELECT 1 FROM decks WHERE id = deck_cards.deck_id AND user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM decks WHERE id = deck_cards.deck_id AND user_id = auth.uid())
  );
CREATE POLICY "Public read public deck cards" ON deck_cards
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM decks WHERE id = deck_cards.deck_id AND is_public = TRUE)
  );

-- Popularity signals: public read
ALTER TABLE popularity_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read popularity_signals" ON popularity_signals FOR SELECT USING (true);
