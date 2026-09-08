-- v2.316 Restrict the daily reminder to games starting at a given time
-- ("HH:MM" as stored on games.start_time). NULL keeps the original
-- behaviour of reminding about every game tomorrow.

ALTER TABLE `email_settings` ADD COLUMN `reminder_start_time` text;
