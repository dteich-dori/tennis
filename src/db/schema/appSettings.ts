import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  backupDir: text("backup_dir").notNull().default("Backup"),
});
