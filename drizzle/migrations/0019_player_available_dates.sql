-- v2.248 Sub-specific positive availability. Date ranges when a sub
-- (or 1+ player acting as a sub) CAN be scheduled. Only meaningful for
-- sub-eligible players (contractedFrequency "0" or "1+") — a sub with
-- one or more ranges here is only considered by Pass 4 (subs) for
-- games whose date falls within one of these ranges. A sub with no
-- ranges is unrestricted (available any date), preserving prior
-- behavior.

CREATE TABLE `player_available_dates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
