-- Add rarity filter to brews
ALTER TABLE brews ADD COLUMN IF NOT EXISTS rarity TEXT;

-- Add brew_id to daily_challenges so admin can assign a brew to a date
ALTER TABLE daily_challenges ADD COLUMN IF NOT EXISTS brew_id UUID REFERENCES brews(id);
