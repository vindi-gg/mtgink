-- Allow anonymous deck creation (no user required)
ALTER TABLE decks ALTER COLUMN user_id DROP NOT NULL;

-- Store original printing info from import (for buy list diffing)
ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS original_set_code TEXT;
ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS original_collector_number TEXT;
ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS original_is_foil BOOLEAN DEFAULT FALSE;
