-- Update best_prices to include foil prices when no non-foil NM price exists
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
  AND p.market_price IS NOT NULL
  AND m.is_active = true
ORDER BY p.scryfall_id, p.is_foil ASC, p.market_price ASC;
