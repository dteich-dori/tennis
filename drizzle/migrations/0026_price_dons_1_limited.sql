-- v2.293 Season fee for the new "1x limited" contract tier ("1L").
-- That tier pays a flat season fee and is never charged for extra
-- games, so there is no matching extras rate to add.

ALTER TABLE `budget_params` ADD COLUMN `price_dons_1_limited` real NOT NULL DEFAULT 0;
