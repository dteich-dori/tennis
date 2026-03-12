import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { seasons } from "./seasons";

export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  cellNumber: text("cell_number"),
  homeNumber: text("home_number"),
  email: text("email"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  contractedFrequency: text("contracted_frequency").notNull().default("1"), // "1", "2", or "2+"
  skillLevel: text("skill_level").notNull().default("C"), // "A", "B", "C", "D"
  noConsecutiveDays: integer("no_consecutive_days", { mode: "boolean" }).notNull().default(false),
  isDerated: integer("is_derated", { mode: "boolean" }).notNull().default(false),
  noEarlyGames: integer("no_early_games", { mode: "boolean" }).notNull().default(false),
  cGamesOk: integer("c_games_ok", { mode: "boolean" }).notNull().default(false),
  soloGames: integer("solo_games"), // 1-36 target games per season, null = not in solo group
});

export const playerBlockedDays = sqliteTable("player_blocked_days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0-6
});

export const playerVacations = sqliteTable("player_vacations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(), // Last day of vacation
});

export const playerDoNotPair = sqliteTable("player_do_not_pair", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  pairedPlayerId: integer("paired_player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
});

