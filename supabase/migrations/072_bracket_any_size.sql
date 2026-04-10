-- Relax brews size constraints for bracket mode:
-- 1. bracket_size no longer has to be a power of 2 (supports any integer >= 2)
-- 2. pool_size for brackets can exceed the 50-card gauntlet cap (bracket pools
--    are the bracket itself, so they might hold 128 or more)

-- Drop old bracket_size enum-style check
ALTER TABLE brews DROP CONSTRAINT IF EXISTS brews_bracket_size_check;
ALTER TABLE brews ADD CONSTRAINT brews_bracket_size_check
  CHECK (bracket_size IS NULL OR bracket_size >= 2);

-- Replace the pool_size 3-50 cap with a more permissive range that still
-- catches bogus values. Gauntlet UI still clamps at 50 for usability.
ALTER TABLE brews DROP CONSTRAINT IF EXISTS brews_pool_size_check;
ALTER TABLE brews ADD CONSTRAINT brews_pool_size_check
  CHECK (pool_size IS NULL OR (pool_size >= 2 AND pool_size <= 1024));
