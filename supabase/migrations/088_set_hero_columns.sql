-- Cache the per-set hero illustration on the sets row so:
--   1) the homepage 4-tile row reads heroes in one query, not 8 RPCs
--   2) the /sets browse page renders heroes from initial page data,
--      no lazy IntersectionObserver fetch dance
--   3) we can require the hero be EXCLUSIVE to the set family
--      (no reprints elsewhere) — picking one is too expensive at request
--      time but trivial as a daily batch.
--
-- Computed by scripts/compute_set_heroes.sql (run nightly).

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS hero_illustration_id UUID,
  ADD COLUMN IF NOT EXISTS hero_set_code TEXT,
  ADD COLUMN IF NOT EXISTS hero_collector_number TEXT,
  ADD COLUMN IF NOT EXISTS hero_image_version TEXT,
  ADD COLUMN IF NOT EXISTS hero_computed_at TIMESTAMPTZ;
