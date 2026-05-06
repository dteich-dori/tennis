import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/**
 * GET /api/migrate/locked-extra-games
 * Adds the `locked_extra_games` column (INTEGER, nullable) to the `players`
 * table. Idempotent — re-running is a no-op once the column exists.
 */
export async function GET() {
  try {
    const database = await db();
    try {
      await database.run(
        sql`ALTER TABLE players ADD COLUMN locked_extra_games INTEGER`
      );
      return NextResponse.json({
        success: true,
        message: "locked_extra_games column added",
      });
    } catch (err) {
      // Walk the error chain looking for "duplicate column"
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
    console.error("[migrate/locked-extra-games] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
