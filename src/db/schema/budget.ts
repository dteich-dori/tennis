import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { seasons } from "./seasons";

// Per-season budget parameters (one row per season, upserted)
export const budgetParams = sqliteTable("budget_params", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  weeksPerSeason: integer("weeks_per_season").notNull().default(36),
  gameDurationHours: real("game_duration_hours").notNull().default(1.5),
  costPerCourtPerHour: real("cost_per_court_per_hour").notNull().default(1740),
  priceDons1: real("price_dons_1").notNull().default(0),
  priceDons2: real("price_dons_2").notNull().default(0),
  priceDons2plus: real("price_dons_2plus").notNull().default(0),
  priceSubs: real("price_subs").notNull().default(0),
  priceSolo: real("price_solo").notNull().default(0),
  priceExtraHour: real("price_extra_hour").notNull().default(23),
  priceSoloSeason: real("price_solo_season").notNull().default(0),
});

// Manual income/expense line items
export const budgetItems = sqliteTable("budget_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // "income" or "expense"
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});
