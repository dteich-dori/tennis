-- v2.277 Remove the extras-lock mechanism entirely. The Lock column was
-- dropped from the Don's tab in v2.276; this removes the storage behind
-- it. Extras counts are now always derived from scheduled games.
-- Verified empty (0 rows across all seasons) before dropping.

ALTER TABLE `players` DROP COLUMN `locked_extra_games`;
