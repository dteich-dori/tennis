CREATE TABLE `player_solo_pairs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`paired_player_id` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paired_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `seasons` ALTER COLUMN "created_at" TO "created_at" text NOT NULL DEFAULT (datetime('now'));--> statement-breakpoint
ALTER TABLE `seasons` ALTER COLUMN "updated_at" TO "updated_at" text NOT NULL DEFAULT (datetime('now'));--> statement-breakpoint
ALTER TABLE `seasons` ADD `max_derated_per_week` integer;--> statement-breakpoint
ALTER TABLE `players` ADD `is_derated` integer DEFAULT false NOT NULL;