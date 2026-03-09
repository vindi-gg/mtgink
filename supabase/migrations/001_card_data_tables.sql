-- Card data tables (migrated from mtgink.db SQLite)

CREATE TABLE IF NOT EXISTS sets (
  set_code TEXT PRIMARY KEY,
  set_id UUID,
  name TEXT NOT NULL,
  set_type TEXT,
  released_at TEXT,
  card_count INTEGER,
  printed_size INTEGER,
  icon_svg_uri TEXT,
  parent_set_code TEXT,
  block_code TEXT,
  block TEXT,
  digital BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_sets_type ON sets(set_type);
CREATE INDEX idx_sets_released ON sets(released_at);

CREATE TABLE IF NOT EXISTS oracle_cards (
  oracle_id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  layout TEXT,
  mana_cost TEXT,
  cmc REAL,
  type_line TEXT,
  oracle_text TEXT,
  colors JSONB DEFAULT '[]'::jsonb,
  color_identity JSONB DEFAULT '[]'::jsonb,
  keywords JSONB DEFAULT '[]'::jsonb,
  power TEXT,
  toughness TEXT,
  loyalty TEXT,
  defense TEXT,
  legalities JSONB DEFAULT '{}'::jsonb,
  reserved BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_oracle_cards_name ON oracle_cards(name);
CREATE INDEX idx_oracle_cards_slug ON oracle_cards(slug);
CREATE INDEX idx_oracle_cards_type ON oracle_cards(type_line);
CREATE INDEX idx_oracle_cards_name_lower ON oracle_cards(LOWER(name));

CREATE TABLE IF NOT EXISTS printings (
  scryfall_id UUID PRIMARY KEY,
  oracle_id UUID NOT NULL REFERENCES oracle_cards(oracle_id),
  set_code TEXT NOT NULL REFERENCES sets(set_code),
  collector_number TEXT NOT NULL,
  name TEXT NOT NULL,
  layout TEXT,
  mana_cost TEXT,
  type_line TEXT,
  illustration_id UUID,
  artist TEXT,
  rarity TEXT,
  released_at TEXT,
  digital BOOLEAN NOT NULL DEFAULT FALSE,
  tcgplayer_id INTEGER,
  cardmarket_id INTEGER,
  price_usd TEXT,
  price_eur TEXT,
  purchase_uris JSONB,
  image_uris JSONB,
  local_image_normal TEXT,
  local_image_art_crop TEXT
);

CREATE INDEX idx_printings_oracle ON printings(oracle_id);
CREATE INDEX idx_printings_set ON printings(set_code);
CREATE INDEX idx_printings_illustration ON printings(illustration_id);
CREATE INDEX idx_printings_tcgplayer ON printings(tcgplayer_id);
CREATE INDEX idx_printings_cardmarket ON printings(cardmarket_id);
CREATE INDEX idx_printings_released ON printings(released_at);

CREATE TABLE IF NOT EXISTS card_faces (
  id SERIAL PRIMARY KEY,
  scryfall_id UUID NOT NULL REFERENCES printings(scryfall_id),
  face_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  mana_cost TEXT,
  type_line TEXT,
  oracle_text TEXT,
  colors JSONB DEFAULT '[]'::jsonb,
  power TEXT,
  toughness TEXT,
  loyalty TEXT,
  defense TEXT,
  illustration_id UUID,
  image_uris JSONB,
  UNIQUE(scryfall_id, face_index)
);

CREATE INDEX idx_card_faces_scryfall ON card_faces(scryfall_id);

CREATE TABLE IF NOT EXISTS tags (
  tag_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT
);

CREATE INDEX idx_tags_type ON tags(type);

CREATE TABLE IF NOT EXISTS illustration_tags (
  illustration_id UUID NOT NULL,
  tag_id TEXT NOT NULL REFERENCES tags(tag_id),
  PRIMARY KEY (illustration_id, tag_id)
);

CREATE INDEX idx_illustration_tags_tag ON illustration_tags(tag_id);
CREATE INDEX idx_illustration_tags_illustration ON illustration_tags(illustration_id);

CREATE TABLE IF NOT EXISTS oracle_tags (
  oracle_id UUID NOT NULL REFERENCES oracle_cards(oracle_id),
  tag_id TEXT NOT NULL REFERENCES tags(tag_id),
  PRIMARY KEY (oracle_id, tag_id)
);

CREATE INDEX idx_oracle_tags_tag ON oracle_tags(tag_id);
CREATE INDEX idx_oracle_tags_oracle ON oracle_tags(oracle_id);
