-- v2.310 Serial number identifying a swap, stamped on both assignments
-- involved so the two halves can be matched on a printed schedule.
-- Numbered per season from 1; null for assignments never swapped.

ALTER TABLE `game_assignments` ADD COLUMN `swap_serial` integer;
