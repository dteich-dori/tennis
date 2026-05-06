import { sqliteTable, integer, real, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { players } from "./players";

/**
 * Per-player payment ledger. Each row is one deposit/payment received from
 * the player. Sum of amounts gives total deposits for that player; the
 * Accounts Summary page subtracts that from the contract fee to compute
 * Balance Due.
 */
export const playerPayments = sqliteTable("player_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  paidDate: text("paid_date").notNull(), // ISO YYYY-MM-DD
  amount: real("amount").notNull(),
  note: text("note"), // optional, e.g. "Check #123"
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
