CREATE TABLE `email_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`recipient_group` text NOT NULL,
	`recipient_count` integer NOT NULL,
	`recipient_list` text NOT NULL,
	`from_name` text NOT NULL,
	`reply_to` text NOT NULL,
	`sent_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`from_name` text DEFAULT 'Tennis Club' NOT NULL,
	`reply_to` text DEFAULT '' NOT NULL,
	`test_email` text DEFAULT '' NOT NULL,
	`questionnaire_url` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `games` ADD `holiday_name` text DEFAULT '';--> statement-breakpoint
ALTER TABLE `holidays` ADD `name` text DEFAULT '';--> statement-breakpoint
ALTER TABLE `seasons` ADD `total_weeks` integer DEFAULT 36 NOT NULL;