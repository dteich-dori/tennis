-- Track empty slots that auto-assign intentionally left empty because
-- the only remaining candidates were at their weekly contract cap.
-- The end-of-season sweep reads these to decide which slots are safe
-- to fill (with cap lifted). The Schedule grid reads them to render a
-- distinct border so the user can tell "cap-empty" apart from "truly
-- nobody available".

CREATE TABLE `game_capped_slots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `game_id` integer NOT NULL,
  `slot_position` integer NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_capped_slots_game_slot_unique` ON `game_capped_slots` (`game_id`, `slot_position`);
