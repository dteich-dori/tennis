import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

/**
 * POST /api/games/renumber?seasonId=1
 * Re-assigns gameNumber sequentially (1, 2, 3, ...) based on
 * weekNumber, dayOfWeek, startTime, courtNumber order.
 * Assignments are unaffected because they link via gameId (PK), not gameNumber.
 */
export async function POST(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const sid = parseInt(seasonId);

    // Load all games for the season in the desired order
    const allGames = await database
      .select({ id: games.id })
      .from(games)
      .where(eq(games.seasonId, sid))
      .orderBy(
        asc(games.weekNumber),
        asc(games.dayOfWeek),
        asc(games.startTime),
        asc(games.courtNumber)
      );

    // Update each game's number sequentially
    for (let i = 0; i < allGames.length; i++) {
      await database
        .update(games)
        .set({ gameNumber: i + 1 })
        .where(eq(games.id, allGames[i].id));
    }

    return NextResponse.json({
      success: true,
      totalGames: allGames.length,
    });
  } catch (err) {
    console.error("[games/renumber POST] error:", err);
    return NextResponse.json(
      { error: "Failed to renumber games" },
      { status: 500 }
    );
  }
}
