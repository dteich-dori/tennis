-- v2.328 Delete protection.
--
-- Once the schedule has been released to the players, a stray click on
-- "Delete all games", "Clear all assignments" or any auto-assign button
-- would rewrite what everyone is already holding on paper. When this is
-- on, every season-wide delete and every auto-assign path refuses with
-- HTTP 423 until it is switched off again.

ALTER TABLE `seasons` ADD COLUMN `delete_protection` integer DEFAULT 0 NOT NULL;
