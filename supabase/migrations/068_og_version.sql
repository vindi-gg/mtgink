-- Add og_version column to oracle_cards for pre-generated OG image tracking
-- NULL = no pre-generated OG (uses default site OG)
-- Value = unix timestamp of the generation run
ALTER TABLE oracle_cards ADD COLUMN og_version BIGINT DEFAULT NULL;
