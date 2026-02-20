import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { seasons } from "./seasons";

export const courtSchedules = sqliteTable("court_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, ... 6=Saturday
  courtNumber: integer("court_number").notNull(), // 1-6
  startTime: text("start_time").notNull(), // "HH:MM" format
  isSolo: integer("is_solo", { mode: "boolean" }).notNull().default(false),
});
