-- Multi-marketplace pricing system

CREATE TABLE IF NOT EXISTS marketplaces (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  affiliate_param TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed marketplaces
INSERT INTO marketplaces (name, display_name, base_url, affiliate_param, currency) VALUES
  ('tcgplayer', 'TCGPlayer', 'https://www.tcgplayer.com', NULL, 'USD'),
  ('cardmarket', 'Cardmarket', 'https://www.cardmarket.com', NULL, 'EUR'),
  ('manapool', 'Manapool', 'https://manapool.com', NULL, 'USD');

CREATE TABLE IF NOT EXISTS prices (
  id BIGSERIAL PRIMARY KEY,
  scryfall_id UUID NOT NULL REFERENCES printings(scryfall_id),
  marketplace_id INTEGER NOT NULL REFERENCES marketplaces(id),
  product_id TEXT,
  product_url TEXT,
  condition TEXT NOT NULL DEFAULT 'NM',
  is_foil BOOLEAN NOT NULL DEFAULT FALSE,
  market_price NUMERIC(10,2),
  low_price NUMERIC(10,2),
  mid_price NUMERIC(10,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  in_stock BOOLEAN DEFAULT TRUE,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'scryfall',
  UNIQUE(scryfall_id, marketplace_id, condition, is_foil)
);

CREATE INDEX idx_prices_scryfall ON prices(scryfall_id);
CREATE INDEX idx_prices_marketplace ON prices(marketplace_id);
CREATE INDEX idx_prices_product ON prices(product_id);
CREATE INDEX idx_prices_updated ON prices(last_updated);

-- Best price view: cheapest NM non-foil per printing across marketplaces
CREATE OR REPLACE VIEW best_prices AS
SELECT DISTINCT ON (p.scryfall_id)
  p.scryfall_id,
  p.marketplace_id,
  m.name AS marketplace_name,
  m.display_name AS marketplace_display_name,
  p.market_price,
  p.low_price,
  p.mid_price,
  p.currency,
  p.product_url,
  p.last_updated
FROM prices p
JOIN marketplaces m ON p.marketplace_id = m.id
WHERE p.condition = 'NM'
  AND p.is_foil = FALSE
  AND p.market_price IS NOT NULL
  AND m.is_active = TRUE
ORDER BY p.scryfall_id, p.market_price ASC;

-- Track price update runs
CREATE TABLE IF NOT EXISTS price_update_log (
  id SERIAL PRIMARY KEY,
  marketplace TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cards_updated INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running'
);
