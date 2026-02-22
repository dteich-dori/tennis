import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * DELETE /api/games/clear-assignments
 * Body: { seasonId: number }
 * Clears ALL player assignments (Don's and Solo) for the entire season.
 * Games, players, court schedules, holidays, and season settings are preserved.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { seasonId } = (await request.json()) as { seasonId: number };
    if (!seasonId) {
      return NextResponse.json(
        { error: "seasonId is required" },
        { status: 400 }
      );
    }

    const database = await db();

    // Find all games for this season
    const allGames = await database
      .select({ id: games.id })
      .from(games)
      .where(eq(games.seasonId, seasonId));

    const gameIds = allGames.map((g) => g.id);

    if (gameIds.length === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    // Delete all assignments in batches
    let deletedCount = 0;
    const BATCH = 50;
    for (let i = 0; i < gameIds.length; i += BATCH) {
      const batch = gameIds.slice(i, i + BATCH);
      const result = await database
        .delete(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch))
        .returning();
      deletedCount += result.length;
    }

    return NextResponse.json({ success: true, deletedCount });
  } catch (err) {
    console.error("[clear-assignments DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to clear assignments: " + String(err) },
      { status: 500 }
    );
  }
}
