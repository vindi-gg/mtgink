-- Add source, rule_definition, and category columns to tags table
-- for mechanically-derived "ink" tags alongside existing Scryfall community tags.

ALTER TABLE tags ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'scryfall';
ALTER TABLE tags ADD COLUMN IF NOT EXISTS rule_definition TEXT;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_tags_source ON tags(source);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
