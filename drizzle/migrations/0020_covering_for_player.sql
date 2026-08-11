-- v2.254 Attribute a Pass 2.9 "clear swap" sub assignment to the
-- vacationing player they're covering for, so the Schedule page can
-- display e.g. "Golden (for Klein)".

ALTER TABLE `game_assignments` ADD COLUMN `covering_for_player_id` integer REFERENCES players(id) ON DELETE SET NULL;
