-- Add illustration_count column to oracle_cards (eliminates correlated subquery)
ALTER TABLE oracle_cards ADD COLUMN illustration_count INTEGER NOT NULL DEFAULT 0;

-- Populate from current data
UPDATE oracle_cards o
SET illustration_count = (
  SELECT COUNT(DISTINCT p.illustration_id)
  FROM printings p
  WHERE p.oracle_id = o.oracle_id
    AND p.illustration_id IS NOT NULL
);

-- Index for filtering by illustration count
CREATE INDEX idx_oracle_cards_illustration_count ON oracle_cards(illustration_count);

-- GIN trigram index for fast ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_oracle_cards_name_trgm ON oracle_cards USING gin (name gin_trgm_ops);

-- Rewrite search to use the new column
CREATE OR REPLACE FUNCTION search_cards_with_art(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  layout TEXT,
  type_line TEXT,
  mana_cost TEXT,
  colors JSONB,
  cmc REAL
) LANGUAGE sql STABLE AS $$
  SELECT
    o.oracle_id,
    o.name,
    o.slug,
    o.layout,
    o.type_line,
    o.mana_cost,
    o.colors,
    o.cmc
  FROM oracle_cards o
  WHERE o.name ILIKE '%' || p_query || '%'
    AND o.illustration_count >= 2
  ORDER BY o.name
  LIMIT p_limit;
$$;

-- Rewrite card cache to use the new column (no more correlated subquery)
CREATE OR REPLACE FUNCTION get_card_cache()
RETURNS TABLE (
  oracle_id UUID,
  name TEXT,
  slug TEXT,
  layout TEXT,
  type_line TEXT,
  mana_cost TEXT,
  colors JSONB,
  cmc REAL,
  illustration_count BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT
    o.oracle_id,
    o.name,
    o.slug,
    o.layout,
    o.type_line,
    o.mana_cost,
    o.colors,
    o.cmc,
    o.illustration_count::BIGINT
  FROM oracle_cards o
  WHERE o.illustration_count >= 1;
$$;
