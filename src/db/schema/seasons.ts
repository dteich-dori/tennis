import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const seasons = sqliteTable("seasons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startDate: text("start_date").notNull(), // ISO date string, must be a Monday
  endDate: text("end_date").notNull(), // Auto-calculated: startDate + totalWeeks weeks
  totalWeeks: integer("total_weeks").notNull().default(36), // 36 base + makeup weeks
  maxCGamesPerWeek: integer("max_c_games_per_week").default(1), // weeks between C games for 2x cGamesOk players (1=every week, 2=every 2 weeks, 4=monthly); null = no limit
  maxCGamesPerWeek1x: integer("max_c_games_per_week_1x").default(4), // weeks between C games for 1x cGamesOk players (4=monthly); null = no limit
  maxACGamesPerSeason: integer("max_ac_games_per_season").default(1), // max A+C games per season for cGamesOk players; null = no limit
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  // Last time auto-assign ran successfully (UTC ISO). Null = never.
  lastAutoAssignAt: text("last_auto_assign_at"),
  // Last time ANY player record was added, edited, or deleted (UTC ISO).
  // Bumped by every /api/players POST / PUT / DELETE. Used together with
  // lastAutoAssignAt to detect "schedule may be stale" situations.
  lastPlayerChangeAt: text("last_player_change_at"),
  // Monotonic counter that bumps every time the schedule changes
  // (assignment add/remove, auto-assign, holiday toggle, ball balance,
  // pairing balance, etc.). Stamped on every report PDF so the admin can
  // tell at a glance whether two reports were generated against the same
  // schedule snapshot.
  scheduleVersion: integer("schedule_version").notNull().default(1),
  // Number of days per tennis week. Default 5 = Mon–Fri (weekend excluded).
  // 6 = Mon–Sat, 7 = Sun–Sat. Used to compute "available days/week" for the
  // contract-vs-availability reconciliation (see lib/playerAvailability.ts).
  daysPerWeek: integer("days_per_week").notNull().default(5),
  // When true, the end-of-season sweep (auto-fired by auto-assign-all
  // after all weeks finish) fills cap-empty slots by lifting the
  // weekly contract cap. When false (default), cap-empty markers stay
  // visible on the Schedule grid but the slots are left unassigned.
  allowCapOverrideAtSeasonEnd: integer("allow_cap_override_at_season_end", { mode: "boolean" }).notNull().default(false),
  // JSON-encoded array of composition keys (e.g. ["AAAA","AABB",...])
  // the auto-assign may produce. NULL = use lib/compositions.ts
  // DEFAULT_ALLOWED_KEYS (mirrors the pre-v1.204 hard-coded rule).
  allowedCompositions: text("allowed_compositions"),
  // v1.210: minimum A+C games per season for A/B players who have NOT
  // ticked the "cGamesOk" checkbox. Set to 0 to preserve the
  // pre-v1.210 behavior (non-cGamesOk players are only placed in C
  // games by accident via base-contract fill). Default 1 = ensure
  // every A/B player takes at least one C-adjacent game per season
  // so the burden is distributed evenly.
  minACPerNonCGamesOk: integer("min_ac_per_non_c_games_ok").notNull().default(1),
});
