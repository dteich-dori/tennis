import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/**
 * One-off endpoint to apply migration 0013 (sms_opt_out columns on
 * players). Idempotent — probes PRAGMA table_info first.
 */
export async function POST() {
  try {
    const database = await db();
    const info = (await database.run(sql`PRAGMA table_info(players)`)) as unknown as {
      rows: { name: string }[];
    };
    const cols = new Set((info.rows ?? []).map((r) => r.name));
    const added: string[] = [];
    if (!cols.has("sms_opt_out")) {
      await database.run(sql`ALTER TABLE \`players\` ADD COLUMN \`sms_opt_out\` integer DEFAULT 0 NOT NULL`);
      added.push("sms_opt_out");
    }
    if (!cols.has("sms_opt_out_at")) {
      await database.run(sql`ALTER TABLE \`players\` ADD COLUMN \`sms_opt_out_at\` text`);
      added.push("sms_opt_out_at");
    }
    if (!cols.has("sms_opt_out_reason")) {
      await database.run(sql`ALTER TABLE \`players\` ADD COLUMN \`sms_opt_out_reason\` text`);
      added.push("sms_opt_out_reason");
    }
    return NextResponse.json({ ok: true, added });
  } catch (err) {
    console.error("[ensure-sms-opt-out-columns] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
