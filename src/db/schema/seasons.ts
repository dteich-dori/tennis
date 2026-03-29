import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const seasons = sqliteTable("seasons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startDate: text("start_date").notNull(), // ISO date string, must be a Monday
  endDate: text("end_date").notNull(), // Auto-calculated: startDate + totalWeeks weeks
  totalWeeks: integer("total_weeks").notNull().default(36), // 36 base + makeup weeks
  maxDeratedPerWeek: integer("max_derated_per_week"), // null = no limit, 1 = once/week with same derated, 2 = once/2 weeks
  maxCGamesPerWeek: integer("max_c_games_per_week").default(1), // weeks between C games for 2x cGamesOk players (1=every week, 2=every 2 weeks, 4=monthly); null = no limit
  maxCGamesPerWeek1x: integer("max_c_games_per_week_1x").default(4), // weeks between C games for 1x cGamesOk players (4=monthly); null = no limit
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
