import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/**
 * One-off endpoint to apply migration 0011 (signup_requests table)
 * directly, in case drizzle-kit migrate didn't pick it up. Idempotent —
 * uses IF NOT EXISTS.
 */
export async function POST() {
  try {
    const database = await db();
    await database.run(sql`
      CREATE TABLE IF NOT EXISTS \`signup_requests\` (
        \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        \`first_name\` text NOT NULL,
        \`last_name\` text NOT NULL,
        \`cell_number\` text,
        \`carrier\` text,
        \`email\` text,
        \`notes\` text,
        \`consent_given\` integer DEFAULT 1 NOT NULL,
        \`consent_text\` text NOT NULL,
        \`consent_ip\` text,
        \`consent_user_agent\` text,
        \`status\` text DEFAULT 'pending' NOT NULL,
        \`created_at\` text NOT NULL,
        \`reviewed_at\` text,
        \`reviewed_by\` text
      )
    `);
    return NextResponse.json({ ok: true, message: "signup_requests table ready." });
  } catch (err) {
    console.error("[ensure-signup-requests-table] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
