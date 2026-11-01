import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { swapAdminLog } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET /api/games/swap-log — the last 50 changes made through delegates' links. */
export async function GET() {
  try {
    const database = await db();
    const rows = await database.select().from(swapAdminLog).orderBy(desc(swapAdminLog.id)).limit(50);
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
