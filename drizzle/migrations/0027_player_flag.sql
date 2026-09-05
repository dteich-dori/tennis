-- v2.299 Scratch flag for building an ad-hoc recipient group in
-- Communications. Set from the Players list, cleared in bulk; carries
-- no fixed meaning and nothing else reads it.

ALTER TABLE `players` ADD COLUMN `flagged` integer NOT NULL DEFAULT 0;
