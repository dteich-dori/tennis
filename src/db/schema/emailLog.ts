import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { seasons } from "./seasons";

export const emailLog = sqliteTable("email_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  recipientGroup: text("recipient_group").notNull(), // "ALL", "Contract Players", "Subs", "Test"
  recipientCount: integer("recipient_count").notNull(),
  recipientList: text("recipient_list").notNull(), // comma-separated names
  fromName: text("from_name").notNull(),
  replyTo: text("reply_to").notNull(),
  sentAt: text("sent_at").notNull().default(sql`(datetime('now'))`),
});
