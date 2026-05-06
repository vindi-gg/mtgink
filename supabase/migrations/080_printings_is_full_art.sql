-- True when the art extends beyond the standard card frame and the
-- lightbox should show the full normal card image rather than the
-- art_crop. Derived during import from Scryfall flags:
--   full_art = true   -- dedicated full-art treatment (lands, etc.)
--   border_color = 'borderless'        -- modern borderless prints
--   frame_effects contains 'showcase'  -- showcase frames (Mystical Archive, etc.)
--   frame_effects contains 'extendedart'

ALTER TABLE printings
  ADD COLUMN IF NOT EXISTS is_full_art BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_printings_full_art
  ON printings (is_full_art)
  WHERE is_full_art = TRUE;
