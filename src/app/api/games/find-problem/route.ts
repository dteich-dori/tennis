import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

/**
 * GET /api/games/find-problem?seasonId=1&startWeek=1&totalWeeks=36&afterGameId=123&type=all
 * Scans games starting from startWeek (wrapping around) to find the next problem:
 *   - Incomplete: normal game with < 4 players assigned
 *   - Composition: any A+C combo other than AACC (2A + 2C + 0B)
 * type: "all" (default) checks both, "incomplete" checks only incomplete games
 * afterGameId (optional): skip games up to and including this game in startWeek
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = Number(request.nextUrl.searchParams.get("seasonId"));
    const startWeek = Number(request.nextUrl.searchParams.get("startWeek"));
    const totalWeeks = Number(request.nextUrl.searchParams.get("totalWeeks"));
    const afterGameId = request.nextUrl.searchParams.get("afterGameId");
    const skipId = afterGameId ? Number(afterGameId) : null;
    const type = request.nextUrl.searchParams.get("type") ?? "all";

    if (!seasonId || !startWeek || !totalWeeks) {
      return NextResponse.json({ error: "seasonId, startWeek, totalWeeks required" }, { status: 400 });
    }

    const database = await db();

    // Load all active players once for skill level lookups
    const allPlayers = await database
      .select({ id: players.id, skillLevel: players.skillLevel })
      .from(players)
      .where(and(eq(players.seasonId, seasonId), eq(players.isActive, true)));
    const playerMap = new Map(allPlayers.map((p) => [p.id, p.skillLevel]));

    // Build week search order: startWeek → totalWeeks, then 1 → startWeek-1
    const weekOrder: number[] = [];
    for (let w = startWeek; w <= totalWeeks; w++) weekOrder.push(w);
    for (let w = 1; w < startWeek; w++) weekOrder.push(w);

    const BATCH = 50;

    for (const week of weekOrder) {
      const weekGames = await database
        .select()
        .from(games)
        .where(and(eq(games.seasonId, seasonId), eq(games.weekNumber, week), eq(games.status, "normal")));

      if (weekGames.length === 0) continue;

      // Sort: day → time → court
      weekGames.sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
        return a.courtNumber - b.courtNumber;
      });

      // Load assignments in batches
      const gameIds = weekGames.map((g) => g.id);
      const assignments: { gameId: number; playerId: number }[] = [];
      for (let i = 0; i < gameIds.length; i += BATCH) {
        const batch = gameIds.slice(i, i + BATCH);
        const rows = await database
          .select({ gameId: gameAssignments.gameId, playerId: gameAssignments.playerId })
          .from(gameAssignments)
          .where(inArray(gameAssignments.gameId, batch));
        assignments.push(...rows);
      }

      // Group by game
      const assignmentsByGame = new Map<number, number[]>();
      for (const a of assignments) {
        const arr = assignmentsByGame.get(a.gameId) ?? [];
        arr.push(a.playerId);
        assignmentsByGame.set(a.gameId, arr);
      }

      // Skip logic for afterGameId (only on startWeek)
      let skipping = week === startWeek && skipId !== null;

      for (const game of weekGames) {
        if (skipping) {
          if (game.id === skipId) {
            skipping = false;
          }
          continue;
        }

        const pids = assignmentsByGame.get(game.id) ?? [];

        // Check 1: Incomplete
        if (pids.length < 4) {
          const empty = 4 - pids.length;
          return NextResponse.json({
            found: true,
            weekNumber: week,
            gameId: game.id,
            gameNumber: game.gameNumber,
            problemType: "incomplete",
            problemDescription: `${empty} open slot${empty !== 1 ? "s" : ""} (${pids.length}/4 assigned)`,
          });
        }

        // Check 2: A+C composition violation. Policy v1.127+ allows AACC
        // (2A + 2C + 0B); every other A+C combo is a violation.
        if (type !== "incomplete") {
        const levels = pids.map((id) => playerMap.get(id) ?? "?");
        const aCount = levels.filter((s) => s === "A").length;
        const bCount = levels.filter((s) => s === "B").length;
        const cCount = levels.filter((s) => s === "C").length;
        const hasMix = aCount > 0 && cCount > 0;
        const isAACC = aCount === 2 && bCount === 0 && cCount === 2;
        if (hasMix && !isAACC) {
          return NextResponse.json({
            found: true,
            weekNumber: week,
            gameId: game.id,
            gameNumber: game.gameNumber,
            problemType: "composition",
            problemDescription: `A+C combo not allowed (${levels.sort().join("")}) — only AACC is permitted`,
          });
        }
        }
      }
    }

    return NextResponse.json({ found: false });
  } catch (err) {
    console.error("[find-problem GET] error:", err);
    return NextResponse.json({ error: "Find problem failed: " + String(err) }, { status: 500 });
  }
}
