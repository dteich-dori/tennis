import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { gameCappedSlots, games } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * GET /api/games/capped-slots?seasonId=N
 *
 * Returns slots that the weekly auto-assign left empty because every
 * otherwise-eligible candidate was at their weekly contract cap. Used
 * by the Schedule grid to render a distinct (amber dashed) border on
 * those empty cells.
 *
 * Response shape:
 *   { "<gameId>": [slot, slot, ...], ... }
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }
    const sid = parseInt(seasonId);
    const database = await db();

    // Get the game IDs in this season, then join.
    const seasonGames = await database
      .select({ id: games.id })
      .from(games)
      .where(eq(games.seasonId, sid));
    if (seasonGames.length === 0) {
      return NextResponse.json({});
    }
    const gameIds = seasonGames.map((g) => g.id);
    const rows = await database
      .select()
      .from(gameCappedSlots)
      .where(inArray(gameCappedSlots.gameId, gameIds));

    const byGame: Record<string, number[]> = {};
    for (const r of rows) {
      const key = String(r.gameId);
      if (!byGame[key]) byGame[key] = [];
      byGame[key].push(r.slotPosition);
    }
    return NextResponse.json(byGame);
  } catch (err) {
    console.error("[capped-slots GET] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
