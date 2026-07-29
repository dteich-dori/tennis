-- v1.210 Minimum A+C games per season for non-cGamesOk A/B players.
-- Default 1 = distribute one make-up C game to every A/B player even
-- if they haven't ticked cGamesOk. Set to 0 to preserve the pre-v1.210
-- opt-in-only behavior.

ALTER TABLE `seasons` ADD COLUMN `min_ac_per_non_c_games_ok` integer DEFAULT 1 NOT NULL;
