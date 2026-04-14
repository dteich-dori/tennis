import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { seasons, games, gameAssignments, players } from "@/db/schema";
import { eq, and, inArray, lte, gte } from "drizzle-orm";

/**
 * GET /api/public/schedule?week=5
 * GET /api/public/schedule?from=2026-09-14
 * GET /api/public/schedule  (defaults to current week)
 *
 * Public (no auth) — returns games for a single week.
 * `week` takes priority over `from`. If neither is given, uses today's date.
 */
export async function GET(request: NextRequest) {
  try {
    const database = await db();
    const weekParam = request.nextUrl.searchParams.get("week");
    const fromParam = request.nextUrl.searchParams.get("from");
    const referenceDate =
      fromParam || new Date().toISOString().split("T")[0];

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

    // Fallback: if no season contains the reference date, use the latest season
    let season;
    if (allSeasons.length > 0) {
      season = allSeasons[0];
    } else {
      const latest = await database
        .select()
        .from(seasons)
        .orderBy(seasons.id)
      if (latest.length === 0) {
        return NextResponse.json({
          games: [],
          seasonStart: null,
          seasonEnd: null,
          week: 0,
          totalWeeks: 0,
        });
      }
      season = latest[latest.length - 1];
    }

    // Determine which week to show
    let week: number;
    if (weekParam) {
      week = Math.max(1, Math.min(parseInt(weekParam), season.totalWeeks));
    } else {
      const start = new Date(season.startDate + "T00:00:00");
      const ref = new Date(referenceDate + "T00:00:00");
      const diffDays = Math.floor(
        (ref.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );
      // Clamp to season range: if before season → week 1, if after → last week
      week = Math.max(1, Math.min(Math.floor(diffDays / 7) + 1, season.totalWeeks));
    }

    // Fetch games for this week
    const weekGames = await database
      .select()
      .from(games)
      .where(
        and(
          eq(games.seasonId, season.id),
          eq(games.status, "normal"),
          eq(games.weekNumber, week)
        )
      );

    if (weekGames.length === 0) {
      return NextResponse.json({
        games: [],
        seasonStart: season.startDate,
        seasonEnd: season.endDate,
        week,
        totalWeeks: season.totalWeeks,
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

    // Fetch player names
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

    // Sort games by day → time → court
    const sorted = [...weekGames].sort((a, b) => {
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
      week,
      totalWeeks: season.totalWeeks,
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
