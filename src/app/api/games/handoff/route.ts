import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, gameHandoffs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { findHandoffCandidates } from "@/lib/swapSuggestions";
import { loadSwapData } from "@/lib/swapData";
import { bumpScheduleVersion } from "@/lib/bumpScheduleVersion";

/**
 * POST /api/games/handoff   { gameId, fromPlayerId, toPlayerId }
 *
 * `fromPlayerId` cannot play `gameId` and gives it away outright: the
 * receiver takes the slot and nothing comes back. The receiver must be one
 * findHandoffCandidates would offer (same skill, contract player or sub,
 * free that day, no rule broken) — it is re-run here so a stale screen
 * cannot push through a bad handoff.
 */
export async function POST(request: NextRequest) {
  try {
    const { gameId, fromPlayerId, toPlayerId } = (await request.json()) as {
      gameId: number; fromPlayerId: number; toPlayerId: number;
    };
    if (!gameId || !fromPlayerId || !toPlayerId) {
      return NextResponse.json({ error: "gameId, fromPlayerId, toPlayerId are required" }, { status: 400 });
    }
    const database = await db();
    const [game] = await database.select().from(games).where(eq(games.id, gameId));
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    if (game.status !== "normal") {
      return NextResponse.json({ error: "Only a normal game can be handed off." }, { status: 400 });
    }

    const { swapPlayers, swapGames } = await loadSwapData(database, game.seasonId);
    const ok = findHandoffCandidates({
      players: swapPlayers, games: swapGames, playerAId: fromPlayerId, gameAId: gameId,
    }).some((c) => c.player.id === toPlayerId);
    if (!ok) {
      return NextResponse.json(
        { error: "That player can't take this game (skill, availability or a pairing rule). Refresh and try again." },
        { status: 400 }
      );
    }

    const [row] = await database
      .select()
      .from(gameAssignments)
      .where(and(eq(gameAssignments.gameId, gameId), eq(gameAssignments.playerId, fromPlayerId)));
    if (!row) {
      return NextResponse.json({ error: "That player is no longer in this game." }, { status: 400 });
    }

    await database.update(gameAssignments).set({ playerId: toPlayerId }).where(eq(gameAssignments.id, row.id));
    await database.insert(gameHandoffs).values({
      gameId, fromPlayerId, toPlayerId, createdAt: new Date().toISOString(),
    });
    await bumpScheduleVersion(game.seasonId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[games/handoff] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
