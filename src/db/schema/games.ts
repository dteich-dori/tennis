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
  // v2.310: serial number of the swap that produced this assignment, set
  // on BOTH sides of a swap so the two halves can be matched up on a
  // printed schedule (e.g. "Teich(1)" in one game, "Klein(1)" in the
  // other). Numbered per season from 1. Null for assignments that were
  // never swapped. A later swap of the same slot overwrites it, so the
  // mark always reflects the most recent swap.
  swapSerial: integer("swap_serial"),
  // v2.254: set by auto-assign's Pass 2.9 (clear-swap sub priority) to
  // the vacationing player this sub is covering for — e.g. Golden's
  // assignment gets coveringForPlayerId = Klein's id. Null for every
  // other assignment (including subs placed by the ordinary Pass 4).
  // ON DELETE SET NULL: if the covered player is later deleted, the
  // assignment itself is still valid, just loses the attribution.
  coveringForPlayerId: integer("covering_for_player_id")
    .references(() => players.id, { onDelete: "set null" }),
});

// Markers for slots that the weekly auto-assign left empty SPECIFICALLY
// because every otherwise-eligible candidate was at their weekly cap
// (vs. truly nobody-available). Written by the end-of-week sweep, read
// by the Schedule grid (renders a distinct border) and by the
// end-of-season sweep (decides whether to fill them by lifting the cap,
// gated by seasons.allowCapOverrideAtSeasonEnd).
export const gameCappedSlots = sqliteTable("game_capped_slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  slotPosition: integer("slot_position").notNull(), // 1-4
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});
