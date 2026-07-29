import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { gameAssignments, gameCappedSlots, games } from "@/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { bumpScheduleVersion } from "@/lib/bumpScheduleVersion";

/** Look up the seasonId for a given game id; null if game not found. */
async function seasonIdForGame(
  database: Awaited<ReturnType<typeof db>>,
  gameId: number
): Promise<number | null> {
  const [row] = await database
    .select({ seasonId: games.seasonId })
    .from(games)
    .where(eq(games.id, gameId));
  return row?.seasonId ?? null;
}

/**
 * POST /api/games/assign
 * Body: { gameId: number, slotPosition: number, playerId: number, isPrefill?: boolean }
 * Assigns a player to a game slot
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      gameId: number;
      slotPosition: number;
      playerId: number;
      isPrefill?: boolean;
    };
    const { gameId, slotPosition, playerId, isPrefill } = body;

    if (!gameId || !playerId) {
      return NextResponse.json({ error: "gameId and playerId are required" }, { status: 400 });
    }
    if (typeof slotPosition !== "number" || slotPosition < 1 || slotPosition > 4) {
      return NextResponse.json({ error: "slotPosition must be 1-4" }, { status: 400 });
    }

    const database = await db();

    // Same-date conflict check (v1.207): a player can't be assigned to
    // TWO games (Solo + Don's, or any other combination) on the same
    // date. The auto-assign paths respect this, but the manual assign
    // POST previously had no guard, letting the Schedule dropdown pick
    // a player who was already on another game that day.
    const [thisGame] = await database
      .select({ id: games.id, date: games.date, seasonId: games.seasonId })
      .from(games)
      .where(eq(games.id, gameId));
    if (!thisGame) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    const sameSeasonGamesOnDate = await database
      .select({ id: games.id })
      .from(games)
      .where(and(
        eq(games.seasonId, thisGame.seasonId),
        eq(games.date, thisGame.date),
        ne(games.id, gameId),
      ));
    if (sameSeasonGamesOnDate.length > 0) {
      const otherIds = sameSeasonGamesOnDate.map((g) => g.id);
      const conflicts = await database
        .select({ gameId: gameAssignments.gameId })
        .from(gameAssignments)
        .where(and(
          inArray(gameAssignments.gameId, otherIds),
          eq(gameAssignments.playerId, playerId),
        ));
      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            error: `Player is already assigned to another game on ${thisGame.date}. Remove that assignment first if you meant to move them.`,
          },
          { status: 409 }
        );
      }
    }

    const result = await database
      .insert(gameAssignments)
      .values({
        gameId,
        slotPosition,
        playerId,
        isPrefill: isPrefill ?? false,
      })
      .returning();

    // Clear any cap-empty marker for this slot — it's filled now.
    await database
      .delete(gameCappedSlots)
      .where(and(
        eq(gameCappedSlots.gameId, gameId),
        eq(gameCappedSlots.slotPosition, slotPosition),
      ));

    // Reuse the season id we already looked up above.
    await bumpScheduleVersion(thisGame.seasonId);
    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    console.error("[games/assign POST] error:", err);
    return NextResponse.json(
      { error: "Failed to assign player" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/games/assign?id=1        — Removes a single assignment
 * DELETE /api/games/assign?gameId=1    — Removes ALL assignments for a game (clear game slot)
 */
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const gameId = request.nextUrl.searchParams.get("gameId");

    if (!id && !gameId) {
      return NextResponse.json({ error: "id or gameId required" }, { status: 400 });
    }

    const database = await db();

    let touchedSeasonId: number | null = null;

    if (gameId) {
      // Clear all assignments for the game
      const gid = parseInt(gameId);
      touchedSeasonId = await seasonIdForGame(database, gid);
      await database
        .delete(gameAssignments)
        .where(eq(gameAssignments.gameId, gid));
    } else {
      // Remove a single assignment — look up its game first
      const aid = parseInt(id!);
      const [assignment] = await database
        .select({ gameId: gameAssignments.gameId })
        .from(gameAssignments)
        .where(eq(gameAssignments.id, aid));
      if (assignment) touchedSeasonId = await seasonIdForGame(database, assignment.gameId);
      await database
        .delete(gameAssignments)
        .where(eq(gameAssignments.id, aid));
    }

    if (touchedSeasonId) await bumpScheduleVersion(touchedSeasonId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[games/assign DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to remove assignment" },
      { status: 500 }
    );
  }
}
