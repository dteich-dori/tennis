import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players, seasons } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

/**
 * GET /api/sms-opt-outs?seasonId=N
 *
 * Returns every player with sms_opt_out = true, ordered by most recent
 * flip first. Optionally scoped to a single season (default = latest).
 */
export async function GET(request: NextRequest) {
  try {
    const database = await db();
    const seasonIdParam = request.nextUrl.searchParams.get("seasonId");
    let seasonId: number | null = null;
    if (seasonIdParam) {
      seasonId = parseInt(seasonIdParam);
    } else {
      const allSeasons = await database.select({ id: seasons.id }).from(seasons);
      if (allSeasons.length > 0) seasonId = allSeasons[allSeasons.length - 1].id;
    }
    if (!seasonId) {
      return NextResponse.json([]);
    }
    const rows = await database
      .select({
        id: players.id,
        firstName: players.firstName,
        lastName: players.lastName,
        cellNumber: players.cellNumber,
        carrier: players.carrier,
        email: players.email,
        isActive: players.isActive,
        smsOptOut: players.smsOptOut,
        smsOptOutAt: players.smsOptOutAt,
        smsOptOutReason: players.smsOptOutReason,
      })
      .from(players)
      .where(and(eq(players.seasonId, seasonId), eq(players.smsOptOut, true)))
      .orderBy(desc(players.smsOptOutAt));
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[sms-opt-outs GET] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
