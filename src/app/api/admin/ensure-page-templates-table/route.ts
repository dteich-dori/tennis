import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

export async function POST() {
  try {
    const database = await db();
    await database.run(sql`
      CREATE TABLE IF NOT EXISTS \`page_templates\` (
        \`key\` text PRIMARY KEY NOT NULL,
        \`content\` text NOT NULL,
        \`updated_at\` text NOT NULL
      )
    `);
    return NextResponse.json({ ok: true, message: "page_templates table ready." });
  } catch (err) {
    console.error("[ensure-page-templates-table] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
