import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/**
 * GET /api/migrate/backup-dir2
 * Adds the `backup_dir2` column (TEXT, nullable) to the `app_settings`
 * table. Idempotent — re-running is a no-op once the column exists.
 */
export async function GET() {
  try {
    const database = await db();
    try {
      await database.run(
        sql`ALTER TABLE app_settings ADD COLUMN backup_dir2 TEXT`
      );
      return NextResponse.json({
        success: true,
        message: "backup_dir2 column added",
      });
    } catch (err) {
      // Walk error chain looking for "duplicate column" / "already exists"
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
        return NextResponse.json({
          success: true,
          message: "column already exists (no-op)",
        });
      }
      throw err;
    }
  } catch (err) {
    console.error("[migrate/backup-dir2] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
