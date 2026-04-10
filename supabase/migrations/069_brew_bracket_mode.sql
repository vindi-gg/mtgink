-- Add bracket as a brew mode and store the chosen bracket size on the brew itself.
-- Each brew is one mode; bracket brews are played as a single-elimination tournament
-- of bracket_size cards drawn from the brew's pool snapshot.

ALTER TABLE brews DROP CONSTRAINT IF EXISTS brews_mode_check;
ALTER TABLE brews ADD CONSTRAINT brews_mode_check
  CHECK (mode IN ('remix', 'vs', 'gauntlet', 'bracket'));

ALTER TABLE brews ADD COLUMN IF NOT EXISTS bracket_size INTEGER
  CHECK (bracket_size IS NULL OR bracket_size IN (8, 16, 32, 64, 128, 256));

-- Bracket mode requires a bracket_size; other modes must not set one
ALTER TABLE brews ADD CONSTRAINT brews_bracket_size_mode_check
  CHECK (
    (mode = 'bracket' AND bracket_size IS NOT NULL)
    OR (mode <> 'bracket' AND bracket_size IS NULL)
  );
