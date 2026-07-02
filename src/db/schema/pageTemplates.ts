import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Editable copy for the public-facing pages. Key = named slot; content
// = markdown or plain text (per slot's expected format). If a row is
// missing, the code falls back to the hardcoded default so the pages
// always render even before the admin has touched anything.
export const pageTemplates = sqliteTable("page_templates", {
  key: text("key").primaryKey(),                // e.g. "sms-terms-body"
  content: text("content").notNull(),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});
