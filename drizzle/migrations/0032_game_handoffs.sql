-- v2.342 Outright hand-offs of a game (player gives a game away, no game
-- taken back). Drives the evening-before "changed game" notice.

CREATE TABLE `game_handoffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`from_player_id` integer NOT NULL,
	`to_player_id` integer NOT NULL,
	`created_at` text NOT NULL,
	`reminder_sent_at` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
