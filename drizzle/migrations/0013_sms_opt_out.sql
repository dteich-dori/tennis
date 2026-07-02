-- A2P 10DLC compliance: track SMS opt-out state per player. When the
-- player replies STOP (or standard opt-out keywords) Twilio's webhook
-- sets sms_opt_out = 1 and records the timestamp + exact message.

ALTER TABLE `players` ADD COLUMN `sms_opt_out` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `players` ADD COLUMN `sms_opt_out_at` text;
--> statement-breakpoint
ALTER TABLE `players` ADD COLUMN `sms_opt_out_reason` text;
