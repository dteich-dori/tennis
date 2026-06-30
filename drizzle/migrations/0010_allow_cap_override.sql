-- Phase 3: setting that controls whether the end-of-season sweep is
-- allowed to fill cap-empty slots by lifting the weekly contract cap.
-- Default false — sweep still RUNS, but only logs / preserves the
-- markers; doesn't override the cap unless this is true.

ALTER TABLE `seasons` ADD COLUMN `allow_cap_override_at_season_end` integer DEFAULT 0 NOT NULL;
