-- Add target_deck_id for re-syncing existing decks from Moxfield
ALTER TABLE moxfield_queue ADD COLUMN IF NOT EXISTS target_deck_id UUID REFERENCES decks(id) ON DELETE SET NULL;
-- Add user_id so imports can be associated with logged-in users
ALTER TABLE moxfield_queue ADD COLUMN IF NOT EXISTS user_id UUID;
