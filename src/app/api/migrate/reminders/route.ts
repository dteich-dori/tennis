import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/**
 * GET /api/migrate/reminders
 * Adds the daily-reminder columns to `email_settings`:
 *   - reminders_enabled INTEGER NOT NULL DEFAULT 0   (boolean)
 *   - reminder_hour     INTEGER NOT NULL DEFAULT 18  (ET hour 0-23)
 *   - reminder_template TEXT    NOT NULL DEFAULT '...'
 * Idempotent — re-running is a no-op once columns exist.
 */
const DEFAULT_TEMPLATE =
  "Hi {firstName},\n\nReminder: you have a game tomorrow ({date}) at {time} on Court {court}.\n\nPartners: {partners}\n\nSee you on the courts!";

export async function GET() {
  const results: { col: string; status: string }[] = [];
  try {
    const database = await db();

    const addCol = async (sqlStmt: ReturnType<typeof sql>, label: string) => {
      try {
        await database.run(sqlStmt);
        results.push({ col: label, status: "added" });
      } catch (err) {
        const parts: string[] = [];
        let cur: unknown = err;
        while (cur) {
          if (cur instanceof Error) {
            parts.push(cur.message);
            cur = (cur as { cause?: unknown }).cause;
          } else {
            parts.push(String(cur));
            break;
          }
        }
        const combined = parts.join(" ").toLowerCase();
        if (
          combined.includes("duplicate column") ||
          combined.includes("already exists")
        ) {
          results.push({ col: label, status: "already exists" });
        } else {
          throw err;
        }
      }
    };

    await addCol(
      sql`ALTER TABLE email_settings ADD COLUMN reminders_enabled INTEGER NOT NULL DEFAULT 0`,
      "reminders_enabled"
    );
    await addCol(
      sql`ALTER TABLE email_settings ADD COLUMN reminder_hour INTEGER NOT NULL DEFAULT 18`,
      "reminder_hour"
    );
    await addCol(
      sql.raw(
        `ALTER TABLE email_settings ADD COLUMN reminder_template TEXT NOT NULL DEFAULT '${DEFAULT_TEMPLATE.replace(/'/g, "''")}'`
      ),
      "reminder_template"
    );

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[migrate/reminders] error:", err);
    return NextResponse.json(
      { error: String(err), results },
      { status: 500 }
    );
  }
}
