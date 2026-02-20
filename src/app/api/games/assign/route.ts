import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { gameAssignments } from "@/db/schema";
import { eq } from "drizzle-orm";

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

    const result = await database
      .insert(gameAssignments)
      .values({
        gameId,
        slotPosition,
        playerId,
        isPrefill: isPrefill ?? false,
      })
      .returning();

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

    if (gameId) {
      // Clear all assignments for the game
      await database
        .delete(gameAssignments)
        .where(eq(gameAssignments.gameId, parseInt(gameId)));
    } else {
      // Remove a single assignment
      await database
        .delete(gameAssignments)
        .where(eq(gameAssignments.id, parseInt(id!)));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[games/assign DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to remove assignment" },
      { status: 500 }
    );
  }
}
