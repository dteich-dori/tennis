import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * POST /api/games/balance-balls
 * Body: { seasonId: number, weekNumber: number, group: "dons" | "solo", apply?: boolean }
 *   OR: { seasonId: number, group: "solo", allWeeks: true }  (season-wide, always applies)
 *
 * Balances ball-bringing duty (slot 1) across players for the given week & group.
 *
 * Algorithm:
 * 1. Snapshot all assignments for the week/group before changes
 * 2. Calculate each player's expected ball count: round(totalGamesInGroup / 4)
 * 3. Multi-pass swaps within each fully-assigned game (4 players)
 *    - Move the player with lowest (actualBalls - expectedBalls) into slot 1
 * 4. Early stop after 2 consecutive non-improving passes
 * 5. If apply=true, persist changes; otherwise return preview
 *
 * allWeeks mode: processes ALL weeks for the group at once (used for solo season-wide balancing)
 */
export async function POST(request: NextRequest) {
  const database = await db();

  try {
    const body = (await request.json()) as {
      seasonId: number;
      weekNumber?: number;
      group: string;
      apply?: boolean;
      allWeeks?: boolean;
    };
    const { seasonId, weekNumber, group, apply, allWeeks } = body;

    if (!seasonId || !group) {
      return NextResponse.json(
        { error: "seasonId and group are required" },
        { status: 400 }
      );
    }

    if (!allWeeks && !weekNumber) {
      return NextResponse.json(
        { error: "weekNumber is required (or use allWeeks: true)" },
        { status: 400 }
      );
    }

    if (group !== "dons" && group !== "solo") {
      return NextResponse.json(
        { error: "group must be 'dons' or 'solo'" },
        { status: 400 }
      );
    }

    // 1. Load games — either for one week or all weeks
    const targetGames = allWeeks
      ? await database
          .select()
          .from(games)
          .where(
            and(
              eq(games.seasonId, seasonId),
              eq(games.group, group),
              eq(games.status, "normal")
            )
          )
      : await database
          .select()
          .from(games)
          .where(
            and(
              eq(games.seasonId, seasonId),
              eq(games.weekNumber, weekNumber!),
              eq(games.group, group),
              eq(games.status, "normal")
            )
          );

    if (targetGames.length === 0) {
      return NextResponse.json({ error: "No games found" }, { status: 404 });
    }

    const gameIds = targetGames.map((g) => g.id);

    // 2. Load all assignments for these games (in batches for large sets)
    type AssignmentRow = { id: number; gameId: number; slotPosition: number; playerId: number; isPrefill: boolean };
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

    // Only consider fully-assigned games (exactly 4 players)
    const fullyAssignedGameIds = gameIds.filter(
      (gid) => (assignmentsByGame.get(gid) ?? []).length === 4
    );

    if (fullyAssignedGameIds.length === 0) {
      return NextResponse.json({
        swaps: 0,
        preview: [],
        message: "No fully-assigned games to balance",
      });
    }

    // 3. Count each player's total games in this group for the ENTIRE season
    //    to compute expected ball count
    const seasonGameCounts = await database
      .select({
        playerId: gameAssignments.playerId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, seasonId),
          eq(games.group, group),
          eq(games.status, "normal")
        )
      )
      .groupBy(gameAssignments.playerId);

    const totalGamesMap = new Map<number, number>();
    for (const row of seasonGameCounts) {
      totalGamesMap.set(row.playerId, row.count);
    }

    // 4. Count each player's current ball count (slot 1) across ENTIRE season for this group
    const seasonBallCounts = await database
      .select({
        playerId: gameAssignments.playerId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, seasonId),
          eq(games.group, group),
          eq(games.status, "normal"),
          eq(gameAssignments.slotPosition, 1)
        )
      )
      .groupBy(gameAssignments.playerId);

    // Build mutable ball count map (will be updated during simulation)
    const actualBalls = new Map<number, number>();
    for (const row of seasonBallCounts) {
      actualBalls.set(row.playerId, row.count);
    }

    // Expected balls for each player: round(totalGames / 4)
    const expectedBalls = new Map<number, number>();
    for (const [playerId, total] of totalGamesMap) {
      expectedBalls.set(playerId, Math.round(total / 4));
    }

    // Helper: compute total imbalance
    const computeImbalance = (): number => {
      let total = 0;
      for (const [playerId, expected] of expectedBalls) {
        const actual = actualBalls.get(playerId) ?? 0;
        total += Math.abs(actual - expected);
      }
      return total;
    };

    // 5. Snapshot current slot-1 holders for target games (for rollback)
    const snapshot: { gameId: number; originalSlot1PlayerId: number }[] = [];
    for (const gid of fullyAssignedGameIds) {
      const assigns = assignmentsByGame.get(gid)!;
      const slot1 = assigns.find((a) => a.slotPosition === 1);
      if (slot1) {
        snapshot.push({ gameId: gid, originalSlot1PlayerId: slot1.playerId });
      }
    }

    // 6. Multi-pass balancing (max 10 passes, early stop after 2 non-improving)
    let swapCount = 0;
    const swapDetails: {
      gameId: number;
      gameNumber: number;
      date: string;
      oldBallBringer: number;
      newBallBringer: number;
    }[] = [];
    let consecutiveNoImprove = 0;

    // Build a mutable copy of assignments by game for simulation
    // Each entry: { assignmentId, playerId, slotPosition }
    type SimAssignment = { id: number; playerId: number; slotPosition: number };
    const simByGame = new Map<number, SimAssignment[]>();
    for (const gid of fullyAssignedGameIds) {
      const assigns = assignmentsByGame.get(gid)!;
      simByGame.set(
        gid,
        assigns.map((a) => ({
          id: a.id,
          playerId: a.playerId,
          slotPosition: a.slotPosition,
        }))
      );
    }

    // Game lookup for display info
    const gameMap = new Map(targetGames.map((g) => [g.id, g]));

    for (let pass = 0; pass < 10; pass++) {
      const prevImbalance = computeImbalance();
      let passSwaps = 0;

      for (const gid of fullyAssignedGameIds) {
        const assigns = simByGame.get(gid)!;
        const currentSlot1 = assigns.find((a) => a.slotPosition === 1)!;

        // Find the player in this game with the lowest (actualBalls - expectedBalls)
        // i.e., the one who is most "underserved" for ball duty
        let bestCandidate = currentSlot1;
        let bestDeficit = (actualBalls.get(currentSlot1.playerId) ?? 0) - (expectedBalls.get(currentSlot1.playerId) ?? 0);

        for (const a of assigns) {
          if (a.slotPosition === 1) continue;
          const deficit = (actualBalls.get(a.playerId) ?? 0) - (expectedBalls.get(a.playerId) ?? 0);
          if (deficit < bestDeficit) {
            bestDeficit = deficit;
            bestCandidate = a;
          }
        }

        // Swap if a different player should be slot 1
        if (bestCandidate.playerId !== currentSlot1.playerId) {
          // Update in-memory ball counts
          actualBalls.set(
            currentSlot1.playerId,
            (actualBalls.get(currentSlot1.playerId) ?? 0) - 1
          );
          actualBalls.set(
            bestCandidate.playerId,
            (actualBalls.get(bestCandidate.playerId) ?? 0) + 1
          );

          // Record swap details (only on first swap per game to avoid duplicates)
          const gameInfo = gameMap.get(gid)!;
          // Check if we already recorded a swap for this game
          const existingSwapIdx = swapDetails.findIndex((s) => s.gameId === gid);
          if (existingSwapIdx >= 0) {
            // Update the existing swap record
            swapDetails[existingSwapIdx].newBallBringer = bestCandidate.playerId;
          } else {
            swapDetails.push({
              gameId: gid,
              gameNumber: gameInfo.gameNumber,
              date: gameInfo.date,
              oldBallBringer: currentSlot1.playerId,
              newBallBringer: bestCandidate.playerId,
            });
          }

          // Swap slot positions in simulation
          const oldSlot = currentSlot1.slotPosition;
          currentSlot1.slotPosition = bestCandidate.slotPosition;
          bestCandidate.slotPosition = oldSlot;

          passSwaps++;
          swapCount++;
        }
      }

      // Early stop check
      const newImbalance = computeImbalance();
      if (newImbalance >= prevImbalance || passSwaps === 0) {
        consecutiveNoImprove++;
        if (consecutiveNoImprove >= 2) break;
      } else {
        consecutiveNoImprove = 0;
      }
    }

    // Filter to only swaps where old != new (net changes)
    const netSwaps = swapDetails.filter(
      (s) => s.oldBallBringer !== s.newBallBringer
    );

    // 7. If apply (or allWeeks which always applies), persist the swaps
    const shouldApply = apply || allWeeks;
    if (shouldApply && netSwaps.length > 0) {
      for (const gid of fullyAssignedGameIds) {
        const simAssigns = simByGame.get(gid)!;
        for (const sa of simAssigns) {
          await database
            .update(gameAssignments)
            .set({ slotPosition: sa.slotPosition })
            .where(eq(gameAssignments.id, sa.id));
        }
      }
    }

    // For allWeeks mode, build per-player summary
    let playerSummary: { playerId: number; totalGames: number; ballsBrought: number; expected: number }[] | undefined;
    if (allWeeks) {
      playerSummary = [];
      for (const [playerId, total] of totalGamesMap) {
        playerSummary.push({
          playerId,
          totalGames: total,
          ballsBrought: actualBalls.get(playerId) ?? 0,
          expected: expectedBalls.get(playerId) ?? 0,
        });
      }
      playerSummary.sort((a, b) => a.playerId - b.playerId);
    }

    return NextResponse.json({
      swaps: netSwaps.length,
      applied: shouldApply ?? false,
      preview: allWeeks ? undefined : netSwaps.map((s) => ({
        gameId: s.gameId,
        gameNumber: s.gameNumber,
        date: s.date,
        oldBallBringerId: s.oldBallBringer,
        newBallBringerId: s.newBallBringer,
      })),
      imbalance: computeImbalance(),
      snapshot: (apply && !allWeeks) ? snapshot : undefined,
      playerSummary,
    });
  } catch (err) {
    console.error("[games/balance-balls POST] error:", err);
    return NextResponse.json(
      { error: "Failed to balance balls" },
      { status: 500 }
    );
  }
}
