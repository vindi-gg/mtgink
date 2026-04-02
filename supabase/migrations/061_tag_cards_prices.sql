-- Add cheapest_price to tag browse cards
DROP FUNCTION IF EXISTS get_cards_by_tag(TEXT, INTEGER, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION get_cards_by_tag(p_tag_id TEXT, p_limit INTEGER DEFAULT 60, p_offset INTEGER DEFAULT 0, p_tag_type TEXT DEFAULT NULL)
RETURNS TABLE(oracle_id UUID, name TEXT, slug TEXT, type_line TEXT, mana_cost TEXT, set_code TEXT, collector_number TEXT, image_version TEXT, cheapest_price NUMERIC, illustration_count INTEGER)
LANGUAGE sql STABLE
AS $func$
  WITH tagged_oracle_ids AS (
    SELECT ot.oracle_id FROM oracle_tags ot
    WHERE ot.tag_id = p_tag_id AND (p_tag_type IS NULL OR p_tag_type = 'oracle')
    UNION
    SELECT DISTINCT p.oracle_id
    FROM illustration_tags it
    JOIN printings p ON p.illustration_id = it.illustration_id
    WHERE it.tag_id = p_tag_id AND (p_tag_type IS NULL OR p_tag_type = 'illustration')
  ),
  base AS (
    SELECT DISTINCT ON (o.oracle_id)
      o.oracle_id, o.name, o.slug, o.type_line, o.mana_cost,
      p.set_code, p.collector_number, p.image_version, p.scryfall_id
    FROM tagged_oracle_ids t
    JOIN oracle_cards o ON o.oracle_id = t.oracle_id
    JOIN printings p ON p.oracle_id = o.oracle_id AND p.illustration_id IS NOT NULL
    JOIN sets s ON s.set_code = p.set_code
    WHERE o.layout != 'art_series' AND s.digital = FALSE
    ORDER BY o.oracle_id,
      CASE s.set_type
        WHEN 'expansion' THEN 1 WHEN 'core' THEN 2 WHEN 'masters' THEN 3
        WHEN 'draft_innovation' THEN 4 WHEN 'commander' THEN 5 ELSE 6
      END,
      p.released_at DESC
  )
  SELECT b.oracle_id, b.name, b.slug, b.type_line, b.mana_cost,
    b.set_code, b.collector_number, b.image_version,
    bp.market_price AS cheapest_price,
    o.illustration_count
  FROM base b
  LEFT JOIN best_prices bp ON bp.scryfall_id = b.scryfall_id
  LEFT JOIN oracle_cards o ON o.oracle_id = b.oracle_id
  LIMIT p_limit OFFSET p_offset;
$func$;
