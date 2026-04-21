import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import {
  games,
  gameAssignments,
  players,
  playerBlockedDays,
  playerVacations,
  playerDoNotPair,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

interface SwapBody {
  gameAId: number;
  playerAId: number;
  gameBId: number;
  playerBId: number;
}

/**
 * POST /api/games/swap
 * Two-way swap:
 *   - Player A leaves Game X, takes Player B's slot in Game Y
 *   - Player B leaves Game Y, takes Player A's slot in Game X
 * Server re-validates eligibility for both sides before committing.
 * Same group only (Dons<->Dons or Solo<->Solo). Same skill level required.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SwapBody;
    const { gameAId, playerAId, gameBId, playerBId } = body;

    if (!gameAId || !playerAId || !gameBId || !playerBId) {
      return NextResponse.json(
        { error: "gameAId, playerAId, gameBId, playerBId are required" },
        { status: 400 }
      );
    }
    if (gameAId === gameBId) {
      return NextResponse.json(
        { error: "Cannot swap within the same game" },
        { status: 400 }
      );
    }
    if (playerAId === playerBId) {
      return NextResponse.json(
        { error: "Cannot swap a player with themselves" },
        { status: 400 }
      );
    }

    const database = await db();

    // Load both games
    const gs = await database
      .select()
      .from(games)
      .where(inArray(games.id, [gameAId, gameBId]));
    const gameA = gs.find((g) => g.id === gameAId);
    const gameB = gs.find((g) => g.id === gameBId);
    if (!gameA || !gameB) {
      return NextResponse.json(
        { error: "One or both games not found" },
        { status: 404 }
      );
    }
    if (gameA.group !== gameB.group) {
      return NextResponse.json(
        { error: `Groups differ (${gameA.group} vs ${gameB.group}). Swaps must be within same group.` },
        { status: 400 }
      );
    }
    if (gameA.status !== "normal" || gameB.status !== "normal") {
      return NextResponse.json(
        { error: "Both games must be in 'normal' status to swap." },
        { status: 400 }
      );
    }
    if (gameA.date === gameB.date) {
      return NextResponse.json(
        { error: "Both games are on the same date. Swap would create a same-date conflict." },
        { status: 400 }
      );
    }

    // Load both assignments
    const assignmentsInBoth = await database
      .select()
      .from(gameAssignments)
      .where(inArray(gameAssignments.gameId, [gameAId, gameBId]));

    const assignA = assignmentsInBoth.find(
      (a) => a.gameId === gameAId && a.playerId === playerAId
    );
    const assignB = assignmentsInBoth.find(
      (a) => a.gameId === gameBId && a.playerId === playerBId
    );
    if (!assignA) {
      return NextResponse.json(
        { error: `Player A is no longer assigned to Game ${gameA.gameNumber}.` },
        { status: 400 }
      );
    }
    if (!assignB) {
      return NextResponse.json(
        { error: `Player B is no longer assigned to Game ${gameB.gameNumber}.` },
        { status: 400 }
      );
    }

    // Other assignments in each game (for DNP checking)
    const assignA_others = assignmentsInBoth.filter(
      (a) => a.gameId === gameAId && a.playerId !== playerAId
    );
    const assignB_others = assignmentsInBoth.filter(
      (a) => a.gameId === gameBId && a.playerId !== playerBId
    );

    // Load both players
    const pls = await database
      .select()
      .from(players)
      .where(inArray(players.id, [playerAId, playerBId]));
    const playerA = pls.find((p) => p.id === playerAId);
    const playerB = pls.find((p) => p.id === playerBId);
    if (!playerA || !playerB) {
      return NextResponse.json(
        { error: "One or both players not found" },
        { status: 404 }
      );
    }
    if (!playerA.isActive || !playerB.isActive) {
      return NextResponse.json(
        { error: "Both players must be active" },
        { status: 400 }
      );
    }
    if ((playerA.skillLevel || "") !== (playerB.skillLevel || "")) {
      return NextResponse.json(
        { error: `Players have different skill levels (${playerA.skillLevel} vs ${playerB.skillLevel}).` },
        { status: 400 }
      );
    }
    if (gameA.group === "solo") {
      if (!playerA.soloGames || !playerB.soloGames) {
        return NextResponse.json(
          { error: "Both players must be Solo players (soloGames > 0) for a Solo swap" },
          { status: 400 }
        );
      }
    }

    // Load blocked days & vacations & DNP for both players
    const playerIds = [playerAId, playerBId];
    const [blockedRows, vacRows, dnpRows] = await Promise.all([
      database
        .select()
        .from(playerBlockedDays)
        .where(inArray(playerBlockedDays.playerId, playerIds)),
      database
        .select()
        .from(playerVacations)
        .where(inArray(playerVacations.playerId, playerIds)),
      database
        .select()
        .from(playerDoNotPair)
        .where(inArray(playerDoNotPair.playerId, playerIds)),
    ]);

    const blockedByPlayer = new Map<number, number[]>();
    for (const b of blockedRows) {
      const arr = blockedByPlayer.get(b.playerId) ?? [];
      arr.push(b.dayOfWeek);
      blockedByPlayer.set(b.playerId, arr);
    }
    const vacsByPlayer = new Map<number, typeof vacRows>();
    for (const v of vacRows) {
      const arr = vacsByPlayer.get(v.playerId) ?? [];
      arr.push(v);
      vacsByPlayer.set(v.playerId, arr);
    }
    const dnpByPlayer = new Map<number, number[]>();
    for (const d of dnpRows) {
      const arr = dnpByPlayer.get(d.playerId) ?? [];
      arr.push(d.pairedPlayerId);
      dnpByPlayer.set(d.playerId, arr);
    }

    // Check if a player can play a game (used for "A in Game B" and "B in Game A")
    // Takes the game's other assigned players for DNP checking.
    function canPlay(
      pid: number,
      game: { date: string; dayOfWeek: number },
      otherAssignedIds: number[],
      label: string
    ): string | null {
      // Blocked day
      const blocked = blockedByPlayer.get(pid) ?? [];
      if (blocked.includes(game.dayOfWeek)) {
        return `${label} is blocked on ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][game.dayOfWeek]}`;
      }
      // Vacation
      const vacs = vacsByPlayer.get(pid) ?? [];
      for (const v of vacs) {
        if (game.date >= v.startDate && game.date <= v.endDate) {
          return `${label} is on vacation ${v.startDate}\u2014${v.endDate}`;
        }
      }
      // DNP with any of the other players in the target game
      const dnp = dnpByPlayer.get(pid) ?? [];
      for (const otherPid of otherAssignedIds) {
        if (dnp.includes(otherPid)) {
          return `${label} cannot pair with a player already in the target game (do-not-pair)`;
        }
      }
      return null;
    }

    // Need to also check that the swapping player isn't already in another game on the target date
    // (one-game-per-day rule). Query assignments for each player across the two game dates.
    const targetDatesAssignments = await database
      .select({
        gameId: gameAssignments.gameId,
        playerId: gameAssignments.playerId,
        date: games.date,
        gameNumber: games.gameNumber,
      })
      .from(gameAssignments)
      .innerJoin(games, eq(games.id, gameAssignments.gameId))
      .where(
        and(
          inArray(gameAssignments.playerId, playerIds),
          inArray(games.date, [gameA.date, gameB.date])
        )
      );

    // A will move to gameB.date — check A not in another game that day (excluding their current slot in gameA which is on a different date)
    const aConflict = targetDatesAssignments.find(
      (r) => r.playerId === playerAId && r.date === gameB.date && r.gameId !== gameAId
    );
    if (aConflict) {
      return NextResponse.json(
        { error: `Player A is already scheduled in game #${aConflict.gameNumber} on ${gameB.date}` },
        { status: 400 }
      );
    }
    const bConflict = targetDatesAssignments.find(
      (r) => r.playerId === playerBId && r.date === gameA.date && r.gameId !== gameBId
    );
    if (bConflict) {
      return NextResponse.json(
        { error: `Player B is already scheduled in game #${bConflict.gameNumber} on ${gameA.date}` },
        { status: 400 }
      );
    }

    // Eligibility checks: A into gameB, B into gameA
    const errA = canPlay(
      playerAId,
      gameB,
      assignB_others.map((a) => a.playerId),
      `${playerA.lastName}, ${playerA.firstName}`
    );
    if (errA) {
      return NextResponse.json({ error: errA }, { status: 400 });
    }
    const errB = canPlay(
      playerBId,
      gameA,
      assignA_others.map((a) => a.playerId),
      `${playerB.lastName}, ${playerB.firstName}`
    );
    if (errB) {
      return NextResponse.json({ error: errB }, { status: 400 });
    }

    // All good — perform the swap: update playerId on both assignment rows.
    await database
      .update(gameAssignments)
      .set({ playerId: playerBId })
      .where(eq(gameAssignments.id, assignA.id));
    await database
      .update(gameAssignments)
      .set({ playerId: playerAId })
      .where(eq(gameAssignments.id, assignB.id));

    return NextResponse.json({
      success: true,
      swap: {
        gameA: {
          id: gameA.id,
          gameNumber: gameA.gameNumber,
          date: gameA.date,
          weekNumber: gameA.weekNumber,
          startTime: gameA.startTime,
          courtNumber: gameA.courtNumber,
          group: gameA.group,
        },
        gameB: {
          id: gameB.id,
          gameNumber: gameB.gameNumber,
          date: gameB.date,
          weekNumber: gameB.weekNumber,
          startTime: gameB.startTime,
          courtNumber: gameB.courtNumber,
          group: gameB.group,
        },
        playerA: {
          id: playerA.id,
          firstName: playerA.firstName,
          lastName: playerA.lastName,
        },
        playerB: {
          id: playerB.id,
          firstName: playerB.firstName,
          lastName: playerB.lastName,
        },
      },
    });
  } catch (err) {
    console.error("[games/swap] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
