-- Tracks whether we've fetched a high-resolution variant of each printing
-- from TCGPlayer (their fit-in/{N}x{N} URL pattern, which delivers up to
-- 1433×2000 — ~3.7x more pixels than Scryfall's PNG endpoint). The
-- lightbox uses HD when available, falling back to Scryfall PNG.

ALTER TABLE printings
  ADD COLUMN IF NOT EXISTS has_image_hd BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_printings_has_image_hd
  ON printings (has_image_hd)
  WHERE has_image_hd = FALSE;
