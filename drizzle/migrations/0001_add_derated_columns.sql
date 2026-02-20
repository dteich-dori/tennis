ALTER TABLE `players` ADD COLUMN `is_derated` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `seasons` ADD COLUMN `max_derated_per_week` integer;
