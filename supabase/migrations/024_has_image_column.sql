-- Add has_image flag to printings and use it in get_illustrations_for_card
-- Populated by checking which images actually exist on CDN/filesystem

ALTER TABLE printings ADD COLUMN IF NOT EXISTS has_image BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_printings_has_image ON printings(has_image) WHERE has_image = FALSE;

-- Update get_illustrations_for_card to exclude printings without images
CREATE OR REPLACE FUNCTION get_illustrations_for_card(p_oracle_id UUID)
RETURNS TABLE(
  illustration_id UUID,
  artist TEXT,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  released_at TEXT,
  image_version TEXT
)
LANGUAGE sql STABLE
AS $func$
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
    AND p.has_image = TRUE
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
$func$;

-- NOTE: After applying this migration, run the image check script to populate has_image:
--   python3 scripts/check_images.py
-- This checks the CDN/filesystem and sets has_image=FALSE for missing images.
