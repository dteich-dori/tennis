import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { seasons } from "./seasons";

export const holidays = sqliteTable("holidays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // ISO date string
  name: text("name").default(""), // e.g. "Memorial Day", "Labor Day"
});
