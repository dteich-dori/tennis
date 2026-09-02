-- v2.274 Add no_charge flag. When set, the player is never billed:
-- no season/contract fee and no per-game fee. Honored by the Accounts
-- tab, the accounts/bookkeeping PDFs, communications templates, and the
-- Budget page's projected income.

ALTER TABLE `players` ADD COLUMN `no_charge` integer NOT NULL DEFAULT 0;
