import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const seasons = sqliteTable("seasons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startDate: text("start_date").notNull(), // ISO date string, must be a Monday
  endDate: text("end_date").notNull(), // Auto-calculated: startDate + 36 weeks
  maxDeratedPerWeek: integer("max_derated_per_week"), // null = no limit, 1 = once/week with same derated, 2 = once/2 weeks
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
