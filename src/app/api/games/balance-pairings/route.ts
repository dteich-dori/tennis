import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerDoNotPair, seasons } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  optimizePairings,
  type GameData,
  type PlayerData,
  type DnpPair,
} from "@/lib/balancePairings";

/**
 * POST /api/games/balance-pairings
 * Body: { seasonId: number }
 *
 * Balances player pairings across all Don's games for the season by swapping
 * same-level players between same-day games to even out pairing frequencies.
 *
 * Only swaps players of the same skill level (A↔A, B↔B, C↔C).
 * Respects DNP and derated pairing constraints.
 * Always applies changes (no preview mode).
 *
 * Returns: { swaps, imbalanceBefore, imbalanceAfter, mutations }
 */
export async function POST(request: NextRequest) {
  const database = await db();

  try {
    const body = (await request.json()) as { seasonId: number };
    const { seasonId } = body;

    if (!seasonId) {
      return NextResponse.json(
        { error: "seasonId is required" },
        { status: 400 }
      );
    }

    // Load season for maxDeratedPerWeek
    const seasonRows = await database
      .select()
      .from(seasons)
      .where(eq(seasons.id, seasonId));
    if (seasonRows.length === 0) {
      return NextResponse.json(
        { error: "Season not found" },
        { status: 404 }
      );
    }
    const season = seasonRows[0];

    // 1. Load all normal Don's games for the season
    const allDonsGames = await database
      .select()
      .from(games)
      .where(
        and(
          eq(games.seasonId, seasonId),
          eq(games.group, "dons"),
          eq(games.status, "normal")
        )
      );

    if (allDonsGames.length === 0) {
      return NextResponse.json(
        { error: "No Don's games found for this season" },
        { status: 404 }
      );
    }

    // 2. Load all assignments for these games (in batches)
    const gameIds = allDonsGames.map((g) => g.id);
    type AssignmentRow = {
      id: number;
      gameId: number;
      playerId: number;
      slotPosition: number;
      isPrefill: boolean;
    };
    const allAssignments: AssignmentRow[] = [];
    const BATCH = 50;
    for (let i = 0; i < gameIds.length; i += BATCH) {
      const batch = gameIds.slice(i, i + BATCH);
      const rows = await database
        .select()
        .from(gameAssignments)
        .where(
          sql`${gameAssignments.gameId} IN (${sql.join(
            batch.map((id) => sql`${id}`),
            sql`, `
          )})`
        );
      allAssignments.push(...rows);
    }

    // Group assignments by game
    const assignmentsByGame = new Map<number, AssignmentRow[]>();
    for (const a of allAssignments) {
      const arr = assignmentsByGame.get(a.gameId) ?? [];
      arr.push(a);
      assignmentsByGame.set(a.gameId, arr);
    }

    // Build GameData array
    const gameDataArray: GameData[] = allDonsGames.map((g) => ({
      id: g.id,
      weekNumber: g.weekNumber,
      date: g.date,
      dayOfWeek: g.dayOfWeek,
      status: g.status,
      assignments: (assignmentsByGame.get(g.id) ?? []).map((a) => ({
        id: a.id,
        gameId: a.gameId,
        playerId: a.playerId,
        slotPosition: a.slotPosition,
      })),
    }));

    // 3. Load all active players for the season
    const allPlayers = await database
      .select()
      .from(players)
      .where(
        and(eq(players.seasonId, seasonId), eq(players.isActive, true))
      );

    const playerMap = new Map<number, PlayerData>();
    for (const p of allPlayers) {
      playerMap.set(p.id, {
        id: p.id,
        skillLevel: p.skillLevel,
        isDerated: p.isDerated,
      });
    }

    // 4. Load DNP pairs
    const playerIds = allPlayers.map((p) => p.id);
    const dnpRows: DnpPair[] = [];
    for (let i = 0; i < playerIds.length; i += BATCH) {
      const batch = playerIds.slice(i, i + BATCH);
      const rows = await database
        .select()
        .from(playerDoNotPair)
        .where(
          sql`${playerDoNotPair.playerId} IN (${sql.join(
            batch.map((id) => sql`${id}`),
            sql`, `
          )})`
        );
      dnpRows.push(
        ...rows.map((r) => ({
          playerId: r.playerId,
          pairedPlayerId: r.pairedPlayerId,
        }))
      );
    }

    // 5. Run the optimizer
    const result = optimizePairings(
      gameDataArray,
      playerMap,
      dnpRows,
      season.maxDeratedPerWeek
    );

    // 6. Persist mutations to the database
    if (result.mutations.length > 0) {
      for (const m of result.mutations) {
        await database
          .update(gameAssignments)
          .set({ playerId: m.newPlayerId })
          .where(eq(gameAssignments.id, m.assignmentId));
      }
    }

    return NextResponse.json({
      swaps: result.swaps,
      mutations: result.mutations.length,
      imbalanceBefore: Math.round(result.imbalanceBefore * 100) / 100,
      imbalanceAfter: Math.round(result.imbalanceAfter * 100) / 100,
    });
  } catch (err) {
    console.error("[games/balance-pairings POST] error:", err);
    return NextResponse.json(
      { error: "Failed to balance pairings" },
      { status: 500 }
    );
  }
}
