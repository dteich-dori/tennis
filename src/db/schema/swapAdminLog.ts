import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Every change made through a delegate's /swap-admin link. */
export const swapAdminLog = sqliteTable("swap_admin_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  delegatePlayerId: integer("delegate_player_id").notNull(),
  // "swap" | "handoff"
  action: text("action").notNull(),
  // Human-readable line, written at the time (names can change later).
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull(),
});
