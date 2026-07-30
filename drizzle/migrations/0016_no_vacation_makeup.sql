-- v1.216 Per-player opt-out from vacation-makeup front-loading.
-- When true, auto-assign's Pass 2.5 (boosting a player's weekly target
-- ahead of an upcoming vacation to make up missed games) is skipped for
-- this player. Default false = keep front-loading for everyone (existing
-- behavior).

ALTER TABLE `players` ADD COLUMN `no_vacation_makeup` integer DEFAULT false NOT NULL;
