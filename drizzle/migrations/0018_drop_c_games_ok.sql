-- v1.240 Retire the cGamesOk opt-in checkbox.
-- cGamesLimit (already populated per-player) is now the sole control
-- for C-adjacent eligibility: null = Unlimited, 0 = never, N = capped.
-- No data migration needed — existing cGamesLimit values already
-- represent each player's intended allowance.

ALTER TABLE `players` DROP COLUMN `c_games_ok`;
