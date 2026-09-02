-- v2.275 Two accounting columns:
--   prior_year_credit — credit from the previous year's distribution,
--     subtracted from the player's Don's balance.
--   solo_deposit — deposits against the SOLO fee, separate from the
--     Don's deposit ledger in player_payments.

ALTER TABLE `players` ADD COLUMN `prior_year_credit` real NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `players` ADD COLUMN `solo_deposit` real NOT NULL DEFAULT 0;
