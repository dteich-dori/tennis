-- Roll the finer-grained skill levels (AA, BA, BC) back to the original
-- A/B/C/D set. Existing players are remapped as follows:
--   AA → A    (top A's collapse into A)
--   BA → B    ("B almost A" collapses into B)
--   BC → B    ("B almost C" collapses into B)
--   D  → D    (unchanged)

UPDATE `players` SET `skill_level` = 'A' WHERE `skill_level` = 'AA';
--> statement-breakpoint
UPDATE `players` SET `skill_level` = 'B' WHERE `skill_level` = 'BA';
--> statement-breakpoint
UPDATE `players` SET `skill_level` = 'B' WHERE `skill_level` = 'BC';
