-- Cache the count of distinct illustrations per set on the sets row so the
-- homepage tile doesn't have to GROUP BY printings on every request.
-- Populated below; meant to be refreshed by compute_set_heroes.sql (which
-- already runs nightly) — see follow-up to that script.

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS illustration_count INT NOT NULL DEFAULT 0;

UPDATE sets s
SET illustration_count = sub.cnt
FROM (
  SELECT set_code, COUNT(DISTINCT illustration_id) AS cnt
  FROM printings
  WHERE illustration_id IS NOT NULL
  GROUP BY set_code
) sub
WHERE s.set_code = sub.set_code;
