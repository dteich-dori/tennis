import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments } from "@/db/schema";
import { eq, and, inArray, count } from "drizzle-orm";

/**
 * GET /api/games?seasonId=1
 * Optional: &weekNumber=1 to filter by week
 * Optional: &countOnly=true to return just the count (lightweight)
 * Returns games with their assignments
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const weekNumber = request.nextUrl.searchParams.get("weekNumber");
    const countOnly = request.nextUrl.searchParams.get("countOnly");
    const database = await db();

    // Lightweight count-only mode — avoids fetching all game rows
    if (countOnly === "true") {
      const [result] = await database
        .select({ total: count() })
        .from(games)
        .where(eq(games.seasonId, parseInt(seasonId)));
      return NextResponse.json({ count: result.total });
    }

    let allGames;
    if (weekNumber) {
      allGames = await database
        .select()
        .from(games)
        .where(
          and(
            eq(games.seasonId, parseInt(seasonId)),
            eq(games.weekNumber, parseInt(weekNumber))
          )
        );
    } else {
      allGames = await database
        .select()
        .from(games)
        .where(eq(games.seasonId, parseInt(seasonId)));
    }

    // Fetch all assignments, batching to avoid D1's SQL variable limit
    const gameIds = allGames.map((g) => g.id);
    let assignments: {
      id: number;
      gameId: number;
      playerId: number;
      slotPosition: number;
      isPrefill: boolean;
    }[] = [];

    const BATCH_SIZE = 50;
    for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
      const batch = gameIds.slice(i, i + BATCH_SIZE);
      const batchResults = await database
        .select()
        .from(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch));
      assignments.push(...batchResults);
    }

    // Group assignments by gameId
    const assignmentsByGame = new Map<number, typeof assignments>();
    for (const a of assignments) {
      const existing = assignmentsByGame.get(a.gameId) ?? [];
      existing.push(a);
      assignmentsByGame.set(a.gameId, existing);
    }

    // Sort games by week → day → time → court
    const sortedGames = [...allGames].sort((a, b) => {
      if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.startTime !== b.startTime)
        return a.startTime.localeCompare(b.startTime);
      return a.courtNumber - b.courtNumber;
    });

    const result = sortedGames.map((game) => ({
      ...game,
      assignments: (assignmentsByGame.get(game.id) ?? []).sort(
        (a, b) => a.slotPosition - b.slotPosition
      ),
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[games GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load games" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/games
 * Update a game's status (normal, holiday, blanked)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { id: number; status?: string };
    const { id, status } = body;

    const database = await db();
    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;

    const result = await database
      .update(games)
      .set(updates)
      .where(eq(games.id, id))
      .returning();

    return NextResponse.json(result[0]);
  } catch (err) {
    console.error("[games PUT] error:", err);
    return NextResponse.json(
      { error: "Failed to update game" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/games?seasonId=1
 * Deletes all games (and their assignments via cascade) for a season
 */
export async function DELETE(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    await database.delete(games).where(eq(games.seasonId, parseInt(seasonId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[games DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to delete games" },
      { status: 500 }
    );
  }
}
