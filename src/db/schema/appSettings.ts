import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  backupDir: text("backup_dir").notNull().default("Backup"),
  // Optional secondary backup directory — if set, every backup is written
  // to BOTH locations. Useful for redundancy (e.g. local + iCloud Documents).
  backupDir2: text("backup_dir2"),
});
