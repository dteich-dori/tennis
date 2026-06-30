import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/**
 * One-off endpoint to apply migration 0009 (game_capped_slots table)
 * directly, in case drizzle-kit migrate didn't pick it up. Idempotent —
 * uses IF NOT EXISTS. Safe to hit any number of times. Remove this
 * route once the migration is confirmed.
 */
export async function POST() {
  try {
    const database = await db();
    await database.run(sql`
      CREATE TABLE IF NOT EXISTS \`game_capped_slots\` (
        \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        \`game_id\` integer NOT NULL,
        \`slot_position\` integer NOT NULL,
        \`created_at\` text NOT NULL,
        FOREIGN KEY (\`game_id\`) REFERENCES \`games\`(\`id\`) ON UPDATE NO ACTION ON DELETE CASCADE
      )
    `);
    await database.run(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS \`game_capped_slots_game_slot_unique\`
        ON \`game_capped_slots\` (\`game_id\`, \`slot_position\`)
    `);
    return NextResponse.json({ ok: true, message: "game_capped_slots table ready." });
  } catch (err) {
    console.error("[ensure-capped-slots-table] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
