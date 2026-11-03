-- v2.359 Swap notices go by text by default: channel setting, who gets a copy,
-- and a marker so the evening-before notice for a swapped game goes out once.

ALTER TABLE `email_settings` ADD COLUMN `swap_channel` text DEFAULT 'sms-fallback' NOT NULL;
--> statement-breakpoint
ALTER TABLE `email_settings` ADD COLUMN `swap_admin_cell` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `email_settings` ADD COLUMN `swap_coordinator_player_id` integer;
--> statement-breakpoint
ALTER TABLE `game_assignments` ADD COLUMN `swap_reminder_sent_at` text;
