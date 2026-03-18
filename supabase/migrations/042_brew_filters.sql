-- Add subtype filter and "all" source option to brews
ALTER TABLE brews ADD COLUMN subtype TEXT;

-- Update source check constraint to allow "all"
ALTER TABLE brews DROP CONSTRAINT brews_source_check;
ALTER TABLE brews ADD CONSTRAINT brews_source_check
  CHECK (source IN ('card', 'expansion', 'tribe', 'tag', 'artist', 'all'));
