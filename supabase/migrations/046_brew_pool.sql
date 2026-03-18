-- Snapshot the card pool at brew creation time so it doesn't change between plays.
ALTER TABLE brews ADD COLUMN IF NOT EXISTS pool JSONB;
