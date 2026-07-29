import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/** One-off endpoint to apply migration 0014 idempotently. */
export async function POST() {
  try {
    const database = await db();
    const info = (await database.run(sql`PRAGMA table_info(seasons)`)) as unknown as {
      rows: { name: string }[];
    };
    const cols = new Set((info.rows ?? []).map((r) => r.name));
    if (cols.has("allowed_compositions")) {
      return NextResponse.json({ ok: true, added: false, message: "Column already exists." });
    }
    await database.run(sql`ALTER TABLE \`seasons\` ADD COLUMN \`allowed_compositions\` text`);
    return NextResponse.json({ ok: true, added: true });
  } catch (err) {
    console.error("[ensure-allowed-compositions-column] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
