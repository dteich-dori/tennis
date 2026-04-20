import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/**
 * GET /api/migrate/preassigned-games-wanted
 * Adds the `preassigned_games_wanted` column to the `players` table.
 * Safe to call multiple times — silently succeeds if the column already exists.
 */
export async function GET() {
  try {
    const database = await db();
    try {
      await database.run(
        sql`ALTER TABLE players ADD COLUMN preassigned_games_wanted INTEGER`
      );
      return NextResponse.json({
        success: true,
        message: "preassigned_games_wanted column added",
      });
    } catch (err) {
      // Walk the error chain (error.cause, error.cause.cause, ...) looking for
      // SQLite's "duplicate column" / "already exists" text.
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
    console.error("[migrate/preassigned-games-wanted] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
