-- v2.341 Decimal rating (2.00-5.00) per player, entered by hand; replaces the
-- A-D skill level from next season. Null = not rated.

ALTER TABLE `players` ADD COLUMN `decimal_rating` real;
