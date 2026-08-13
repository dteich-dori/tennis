-- v2.258 Add always_available flag for subs who can play any date
-- (subject to blocked days). Used by the clear-swap adjustment pass
-- as a general-pool fallback when no scheduled sub is found.

ALTER TABLE `players` ADD COLUMN `always_available` integer NOT NULL DEFAULT 0;
