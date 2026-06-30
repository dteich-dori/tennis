import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/**
 * One-off endpoint to apply migration 0010 (allow_cap_override_at_season_end
 * column on seasons). SQLite ALTER TABLE ADD COLUMN doesn't support IF NOT
 * EXISTS, so we probe via PRAGMA and skip if already present.
 */
export async function POST() {
  try {
    const database = await db();
    const cols = (await database.run(sql`PRAGMA table_info(seasons)`)) as unknown as {
      rows: { name: string }[];
    };
    const colNames = (cols.rows ?? []).map((r) => r.name);
    if (colNames.includes("allow_cap_override_at_season_end")) {
      return NextResponse.json({ ok: true, message: "Column already exists.", added: false });
    }
    await database.run(sql`
      ALTER TABLE \`seasons\` ADD COLUMN \`allow_cap_override_at_season_end\` integer DEFAULT 0 NOT NULL
    `);
    return NextResponse.json({ ok: true, message: "Column added.", added: true });
  } catch (err) {
    console.error("[ensure-cap-override-column] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
