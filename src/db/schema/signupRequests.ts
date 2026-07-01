import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Public signup submissions from /join. Land in "pending" status and
// require admin review before the person becomes a real player. The
// consent snapshot (text + timestamp + IP + user-agent) is preserved
// so we have per-submission audit evidence for A2P 10DLC / carrier
// compliance reviews.
export const signupRequests = sqliteTable("signup_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  cellNumber: text("cell_number"),
  carrier: text("carrier"),
  email: text("email"),
  notes: text("notes"),
  consentGiven: integer("consent_given", { mode: "boolean" }).notNull().default(true),
  // Snapshot of the exact opt-in text the user saw when they clicked
  // submit. Keep this frozen even if the /join page copy changes later
  // so proof of consent stays intact.
  consentText: text("consent_text").notNull(),
  consentIp: text("consent_ip"),
  consentUserAgent: text("consent_user_agent"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  reviewedAt: text("reviewed_at"),
  reviewedBy: text("reviewed_by"),
});
