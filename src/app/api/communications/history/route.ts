import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { emailLog } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const result = await database
      .select()
      .from(emailLog)
      .where(eq(emailLog.seasonId, parseInt(seasonId)))
      .orderBy(desc(emailLog.sentAt));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[communications/history GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load email history" },
      { status: 500 }
    );
  }
}
