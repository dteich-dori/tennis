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
  testPhone: text("test_phone").notNull().default(""),
  testCarrier: text("test_carrier").notNull().default(""),
  questionnaireUrl: text("questionnaire_url").notNull().default(""),
  // --- Daily reminders (chrono) ---
  // When enabled, an hourly Vercel cron fires reminders at the configured ET
  // hour to every player who has a game scheduled for tomorrow.
  remindersEnabled: integer("reminders_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  reminderHour: integer("reminder_hour").notNull().default(18), // Eastern Time
  reminderTemplate: text("reminder_template").notNull().default(
    "Hi {firstName},\n\nReminder: you have a game tomorrow ({date}) at {time} on Court {court}.\n\nPartners: {partners}\n\nSee you on the courts!"
  ),
  // Channel for the daily reminder cron. Values: "both" (email + SMS),
  // "email", "sms", "sms-fallback" (try SMS, fall back to email on failure).
  reminderChannel: text("reminder_channel").notNull().default("both"),
});
