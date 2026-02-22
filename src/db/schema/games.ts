import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { seasons } from "./seasons";
import { players } from "./players";

export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameNumber: integer("game_number").notNull(),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  date: text("date").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  courtNumber: integer("court_number").notNull(),
  group: text("group").notNull().default("dons"), // "dons" or "solo"
  status: text("status").notNull().default("normal"), // "normal", "holiday", "blanked"
  holidayName: text("holiday_name").default(""), // e.g. "Memorial Day"
});

export const gameAssignments = sqliteTable("game_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  slotPosition: integer("slot_position").notNull(), // 1-4
  isPrefill: integer("is_prefill", { mode: "boolean" }).notNull().default(false),
});

export const ballCounts = sqliteTable("ball_counts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  donsCount: integer("dons_count").notNull().default(0),
  soloCount: integer("solo_count").notNull().default(0),
});
