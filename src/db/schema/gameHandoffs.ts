import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { games } from "./games";

/**
 * A player gave a game away outright — no game taken in return. The
 * assignment row itself is simply re-pointed at the receiver; this table
 * remembers that it happened so the evening-before cron can send the four
 * players of a changed game an extra notice (and only once).
 */
export const gameHandoffs = sqliteTable("game_handoffs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  fromPlayerId: integer("from_player_id").notNull(),
  toPlayerId: integer("to_player_id").notNull(),
  createdAt: text("created_at").notNull(),
  // ISO timestamp of the evening-before notice; null until it is sent.
  reminderSentAt: text("reminder_sent_at"),
});
