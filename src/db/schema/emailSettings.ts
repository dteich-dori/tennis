import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { seasons } from "./seasons";

export const emailSettings = sqliteTable("email_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  fromName: text("from_name").notNull().default("Tennis Club"),
  replyTo: text("reply_to").notNull().default(""),
  testEmail: text("test_email").notNull().default(""),
});
