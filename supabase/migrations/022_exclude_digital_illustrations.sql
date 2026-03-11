-- Exclude digital-only printings from card detail illustrations.
-- get_illustrations_for_card was missing s.digital = FALSE filter,
-- causing Arena/digital printings to show on card detail pages.

DROP FUNCTION IF EXISTS get_illustrations_for_card(UUID);
CREATE OR REPLACE FUNCTION get_illustrations_for_card(p_oracle_id UUID)
RETURNS TABLE (
  illustration_id UUID,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT,
  image_version TEXT
) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (p.illustration_id)
    p.illustration_id,
    p.artist,
    p.set_code,
    s.name AS set_name,
    p.collector_number,
    p.released_at,
    p.image_version
  FROM printings p
  JOIN sets s ON s.set_code = p.set_code
  WHERE p.oracle_id = p_oracle_id
    AND p.illustration_id IS NOT NULL
    AND s.digital = FALSE
  ORDER BY p.illustration_id,
    CASE s.set_type
      WHEN 'expansion' THEN 1
      WHEN 'core' THEN 2
      WHEN 'masters' THEN 3
      WHEN 'draft_innovation' THEN 4
      WHEN 'commander' THEN 5
      ELSE 6
    END,
    p.released_at ASC;
$$;
