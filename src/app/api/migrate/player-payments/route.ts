import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/**
 * GET /api/migrate/player-payments
 * Creates the `player_payments` table. Idempotent — re-running is a no-op
 * once the table exists.
 */
export async function GET() {
  try {
    const database = await db();
    await database.run(
      sql`CREATE TABLE IF NOT EXISTS player_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        paid_date TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    );
    return NextResponse.json({
      success: true,
      message: "player_payments table ready",
    });
  } catch (err) {
    console.error("[migrate/player-payments] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
