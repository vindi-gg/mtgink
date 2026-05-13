-- Compute and cache `hero_*` fields on the sets table.
-- Run nightly: idempotent, fully replaces existing values.
--
-- For each set family (a root set + its child sets via parent_set_code):
--   1. find illustrations that appear ONLY in this family — i.e. no
--      reprints in other sets. these are "exclusive" art.
--   2. among the exclusive illustrations, pick the one with the highest
--      Moxfield commander_chosen_30d signal (or just deterministic fallback
--      if no signal yet — newly-released sets won't have deck data).
--   3. write its representative printing's set_code/cn/image_version
--      back to the family's root set row.
--
-- Sets with no exclusive illustration (mostly old sets where every print
-- has been reprinted elsewhere) get NULL hero — UI falls back to the
-- icon-only tile.

BEGIN;

WITH family_root AS (
  -- root_set = parent_set_code if it exists, otherwise self
  SELECT set_code, COALESCE(parent_set_code, set_code) AS root_set
  FROM sets
),
illustration_family_count AS (
  -- For each illustration, count distinct family-roots it appears in
  SELECT
    p.illustration_id,
    COUNT(DISTINCT fr.root_set) AS family_count,
    -- Safe to use ARRAY_AGG[1] only when family_count = 1
    (ARRAY_AGG(DISTINCT fr.root_set))[1] AS only_root
  FROM printings p
  JOIN family_root fr ON fr.set_code = p.set_code
  WHERE p.illustration_id IS NOT NULL
    AND p.has_image = TRUE
  GROUP BY p.illustration_id
),
exclusive AS (
  SELECT illustration_id, only_root AS family_root
  FROM illustration_family_count
  WHERE family_count = 1
),
-- Pick a representative printing per exclusive illustration: prefer the
-- root set itself over child sets, then most recent release.
representatives AS (
  SELECT DISTINCT ON (e.illustration_id)
    e.family_root,
    e.illustration_id,
    p.set_code        AS printing_set_code,
    p.collector_number,
    p.image_version,
    p.is_full_art
  FROM exclusive e
  JOIN printings p ON p.illustration_id = e.illustration_id
  WHERE p.has_image = TRUE
  ORDER BY e.illustration_id,
    CASE WHEN p.set_code = e.family_root THEN 0 ELSE 1 END,
    p.released_at DESC NULLS LAST,
    p.collector_number
),
ranked AS (
  SELECT
    r.*,
    COALESCE(ps.value, 0)::REAL AS chosen_score,
    ROW_NUMBER() OVER (
      PARTITION BY r.family_root
      ORDER BY
        COALESCE(ps.value, 0) DESC,    -- popular first
        r.is_full_art DESC,            -- then full-art treatments
        r.illustration_id              -- deterministic tiebreaker
    ) AS rn
  FROM representatives r
  LEFT JOIN popularity_signals ps
    ON ps.illustration_id = r.illustration_id
   AND ps.source = 'moxfield'
   AND ps.signal_type = 'commander_chosen_30d'
)
UPDATE sets s
SET
  hero_illustration_id = ranked.illustration_id,
  hero_set_code        = ranked.printing_set_code,
  hero_collector_number = ranked.collector_number,
  hero_image_version   = ranked.image_version,
  hero_computed_at     = NOW()
FROM ranked
WHERE ranked.rn = 1
  AND s.set_code = ranked.family_root;

COMMIT;

-- Refresh illustration_count cache (migration 090). Cheap GROUP BY scan
-- of printings; runs in the same nightly window as the hero compute.
BEGIN;
UPDATE sets s
SET illustration_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT set_code, COUNT(DISTINCT illustration_id) AS cnt
  FROM printings
  WHERE illustration_id IS NOT NULL
  GROUP BY set_code
) sub
WHERE s.set_code = sub.set_code;
COMMIT;

-- Sanity check
SELECT
  COUNT(*) FILTER (WHERE hero_illustration_id IS NOT NULL) AS with_hero,
  COUNT(*) AS total
FROM sets WHERE digital = FALSE;
