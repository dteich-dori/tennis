-- v2.345 Delegated swap admins: a per-player token that opens /swap-admin
-- without a login, plus a log of every change made through it.

ALTER TABLE `players` ADD COLUMN `swap_admin_token` text;
--> statement-breakpoint
CREATE TABLE `swap_admin_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delegate_player_id` integer NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL
);
