-- Adds an is_preview flag to sets so the homepage art listing can pin a
-- spoiler/preview set as the first selector tab. At most one set should
-- have is_preview = true at a time; the partial unique index enforces it.

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS is_preview BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS sets_only_one_preview
  ON sets ((TRUE))
  WHERE is_preview = TRUE;
