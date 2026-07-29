-- Admin-tunable composition rule (v1.204). Stores which A/B/C skill
-- compositions the auto-assign is permitted to produce. NULL means
-- "use the code-shipped default set" — mirrors the pre-tunable
-- behavior so existing seasons keep working unchanged.

ALTER TABLE `seasons` ADD COLUMN `allowed_compositions` text;
