-- v2.281 Credit against the SOLO fee — the solo-side counterpart to
-- prior_year_credit. Subtracted from the solo balance, exactly as
-- prior_year_credit is subtracted from the Don's balance.

ALTER TABLE `players` ADD COLUMN `solo_credit` real NOT NULL DEFAULT 0;
