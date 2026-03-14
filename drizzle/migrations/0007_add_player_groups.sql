ALTER TABLE `players` ADD `group_pct` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE `player_group_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL REFERENCES `players`(`id`) ON DELETE CASCADE,
	`member_id` integer NOT NULL REFERENCES `players`(`id`) ON DELETE CASCADE
);
