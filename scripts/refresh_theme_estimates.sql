-- refresh_theme_estimates.sql
-- Updates pool_size_estimate for all gauntlet_themes based on current data.
-- Run weekly via cron or manually after bulk data imports.
--
-- Usage (from web/):
--   export SUPABASE_DB_URL=$(grep SUPABASE_DB_URL .env.prod | cut -d= -f2-)
--   docker exec -i supabase_db_mtgink psql "$SUPABASE_DB_URL" < ../scripts/refresh_theme_estimates.sql
--
-- Or locally:
--   docker exec -i supabase_db_mtgink psql -U postgres -d postgres < scripts/refresh_theme_estimates.sql

BEGIN;

-- Tribes: count distinct oracle_ids with matching subtype
UPDATE gauntlet_themes SET pool_size_estimate = sub.cnt
FROM (
  SELECT t.id, COUNT(DISTINCT o.oracle_id) AS cnt
  FROM gauntlet_themes t
  JOIN oracle_cards o ON o.subtypes @> jsonb_build_array(t.tribe)
  WHERE t.theme_type = 'tribe' AND t.is_active = true
  GROUP BY t.id
) sub
WHERE gauntlet_themes.id = sub.id;

-- Artists: count distinct non-digital illustrations
UPDATE gauntlet_themes SET pool_size_estimate = sub.cnt
FROM (
  SELECT t.id, COUNT(DISTINCT p.illustration_id) AS cnt
  FROM gauntlet_themes t
  JOIN printings p ON p.artist = t.artist
    AND p.illustration_id IS NOT NULL
  JOIN sets s ON s.set_code = p.set_code AND s.digital = false
  WHERE t.theme_type = 'artist' AND t.is_active = true
  GROUP BY t.id
) sub
WHERE gauntlet_themes.id = sub.id;

-- Tags: count distinct oracle_ids with matching tag
UPDATE gauntlet_themes SET pool_size_estimate = sub.cnt
FROM (
  SELECT t.id, COUNT(DISTINCT ot.oracle_id) AS cnt
  FROM gauntlet_themes t
  JOIN oracle_tags ot ON ot.tag_id = t.tag_id
  WHERE t.theme_type = 'tag' AND t.is_active = true
  GROUP BY t.id
) sub
WHERE gauntlet_themes.id = sub.id;

-- Card remix: count distinct non-digital illustrations for that card
UPDATE gauntlet_themes SET pool_size_estimate = sub.cnt
FROM (
  SELECT t.id, COUNT(DISTINCT p.illustration_id) AS cnt
  FROM gauntlet_themes t
  JOIN printings p ON p.oracle_id = t.oracle_id
    AND p.illustration_id IS NOT NULL
  JOIN sets s ON s.set_code = p.set_code AND s.digital = false
  WHERE t.theme_type = 'card_remix' AND t.is_active = true
  GROUP BY t.id
) sub
WHERE gauntlet_themes.id = sub.id;

COMMIT;

-- Report
SELECT theme_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE pool_size_estimate IS NOT NULL) AS with_estimate,
  ROUND(AVG(pool_size_estimate)) AS avg_pool
FROM gauntlet_themes
WHERE is_active = true
GROUP BY theme_type
ORDER BY theme_type;
