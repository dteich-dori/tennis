-- v2.372 Who is notified after a swap / give-away is editable on the Communications tab.

ALTER TABLE `email_settings` ADD COLUMN `swap_notify_players` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `email_settings` ADD COLUMN `swap_notify_issuer` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `email_settings` ADD COLUMN `swap_extra_recipient_ids` text DEFAULT '[]' NOT NULL;
