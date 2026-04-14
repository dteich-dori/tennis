import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { seasons, games, gameAssignments, players } from "@/db/schema";
import { eq, and, inArray, lte, gte } from "drizzle-orm";

/**
 * GET /api/public/schedule?from=2026-09-14
 * Public (no auth) — returns games for 2 weeks starting from the given date.
 * If `from` is omitted, defaults to today.
 * The date is snapped to the Monday of its week for consistent week boundaries.
 */
export async function GET(request: NextRequest) {
  try {
    const database = await db();
    const fromParam = request.nextUrl.searchParams.get("from");
    const referenceDate = fromParam || new Date().toISOString().split("T")[0];

    // Find the current season (startDate ≤ referenceDate ≤ endDate)
    const allSeasons = await database
      .select()
      .from(seasons)
      .where(
        and(
          lte(seasons.startDate, referenceDate),
          gte(seasons.endDate, referenceDate)
        )
      );

    if (allSeasons.length === 0) {
      return NextResponse.json({
        games: [],
        seasonStart: null,
        seasonEnd: null,
        currentWeek: 0,
      });
    }
    const season = allSeasons[0];

    // Compute week number for the reference date (1-based)
    const start = new Date(season.startDate + "T00:00:00");
    const ref = new Date(referenceDate + "T00:00:00");
    const diffDays = Math.floor(
      (ref.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const currentWeek = Math.max(1, Math.floor(diffDays / 7) + 1);
    const nextWeek = currentWeek + 1;

    // Fetch games for both weeks
    const weekGames = await database
      .select()
      .from(games)
      .where(
        and(
          eq(games.seasonId, season.id),
          eq(games.status, "normal"),
          inArray(games.weekNumber, [currentWeek, nextWeek])
        )
      );

    if (weekGames.length === 0) {
      return NextResponse.json({
        games: [],
        seasonStart: season.startDate,
        seasonEnd: season.endDate,
        currentWeek,
      });
    }

    // Fetch assignments
    const gameIds = weekGames.map((g) => g.id);
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

    // Fetch player names for all assigned players
    const playerIds = [...new Set(assignments.map((a) => a.playerId))];
    let playerMap = new Map<number, { firstName: string; lastName: string }>();

    if (playerIds.length > 0) {
      for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
        const batch = playerIds.slice(i, i + BATCH_SIZE);
        const batchPlayers = await database
          .select({
            id: players.id,
            firstName: players.firstName,
            lastName: players.lastName,
          })
          .from(players)
          .where(inArray(players.id, batch));
        for (const p of batchPlayers) {
          playerMap.set(p.id, {
            firstName: p.firstName,
            lastName: p.lastName,
          });
        }
      }
    }

    // Group assignments by game
    const assignmentsByGame = new Map<number, typeof assignments>();
    for (const a of assignments) {
      const existing = assignmentsByGame.get(a.gameId) ?? [];
      existing.push(a);
      assignmentsByGame.set(a.gameId, existing);
    }

    // Sort games by week → day → time → court
    const sorted = [...weekGames].sort((a, b) => {
      if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.startTime !== b.startTime)
        return a.startTime.localeCompare(b.startTime);
      return a.courtNumber - b.courtNumber;
    });

    const result = sorted.map((game) => {
      const gameAssigns = (assignmentsByGame.get(game.id) ?? []).sort(
        (a, b) => a.slotPosition - b.slotPosition
      );
      return {
        gameNumber: game.gameNumber,
        date: game.date,
        weekNumber: game.weekNumber,
        dayOfWeek: game.dayOfWeek,
        startTime: game.startTime,
        courtNumber: game.courtNumber,
        group: game.group,
        players: gameAssigns.map((a) => {
          const p = playerMap.get(a.playerId);
          return {
            slotPosition: a.slotPosition,
            firstName: p?.firstName ?? "",
            lastName: p?.lastName ?? "",
          };
        }),
      };
    });

    return NextResponse.json({
      seasonStart: season.startDate,
      seasonEnd: season.endDate,
      currentWeek,
      games: result,
    });
  } catch (err) {
    console.error("[public/schedule GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load schedule" },
      { status: 500 }
    );
  }
}
