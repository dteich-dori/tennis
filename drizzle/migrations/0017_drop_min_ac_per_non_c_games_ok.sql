-- v1.236 Remove the season-wide "C games minimum" floor.
-- minACPerNonCGamesOk was a fallback used only when a player's own
-- cGamesLimit was null. Every active player now has an explicit
-- cGamesLimit, so the fallback was dead in practice. cGamesLimit === null
-- now means Unlimited for that player instead of "use this season floor".

ALTER TABLE `seasons` DROP COLUMN `min_ac_per_non_c_games_ok`;
