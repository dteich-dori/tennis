import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, seasons } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * GET /api/games/composition?seasonId=5
 * Returns game composition analysis: how many games have each skill-level mix,
 * plus detail on A+C combination games.
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const sid = parseInt(seasonId);

    // Get season info
    const seasonRows = await database
      .select()
      .from(seasons)
      .where(eq(seasons.id, sid));
    if (seasonRows.length === 0) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }
    const season = seasonRows[0];

    // Get all complete games (4 assignments) for dons group
    const gameRows = await database
      .select({
        gameId: games.id,
        date: games.date,
        gameNumber: games.gameNumber,
      })
      .from(games)
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.status, "normal"),
          eq(games.group, "dons")
        )
      );

    // Get all assignments with player skill levels
    const assignmentRows = await database
      .select({
        gameId: gameAssignments.gameId,
        playerId: gameAssignments.playerId,
        firstName: players.firstName,
        lastName: players.lastName,
        skillLevel: players.skillLevel,
      })
      .from(gameAssignments)
      .innerJoin(players, eq(gameAssignments.playerId, players.id))
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.status, "normal"),
          eq(games.group, "dons")
        )
      );

    // Group assignments by game
    const gameMap = new Map<
      number,
      {
        date: string;
        gameNumber: number;
        players: { name: string; level: string }[];
      }
    >();

    for (const row of gameRows) {
      gameMap.set(row.gameId, {
        date: row.date,
        gameNumber: row.gameNumber,
        players: [],
      });
    }

    for (const row of assignmentRows) {
      const game = gameMap.get(row.gameId);
      if (game) {
        game.players.push({
          name: `${row.firstName} ${row.lastName}`,
          level: row.skillLevel,
        });
      }
    }

    // Filter to complete games (4 players)
    const completeGames: {
      gameId: number;
      date: string;
      gameNumber: number;
      players: { name: string; level: string }[];
      composition: string;
    }[] = [];

    for (const [gameId, game] of gameMap) {
      if (game.players.length === 4) {
        const levels = game.players
          .map((p) => p.level)
          .sort()
          .join("");
        completeGames.push({ gameId, ...game, composition: levels });
      }
    }

    // Count compositions
    const compositionCounts: Record<string, number> = {};
    for (const game of completeGames) {
      compositionCounts[game.composition] =
        (compositionCounts[game.composition] || 0) + 1;
    }

    const totalGames = completeGames.length;

    const compositions = Object.entries(compositionCounts)
      .map(([compType, count]) => ({
        compType,
        count,
        pct: totalGames > 0 ? Math.round((count / totalGames) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Find A+C games
    const acGames = completeGames
      .filter((g) => {
        const hasA = g.players.some((p) => p.level === "A");
        const hasC = g.players.some((p) => p.level === "C");
        return hasA && hasC;
      })
      .map((g) => ({
        date: g.date,
        gameNumber: g.gameNumber,
        players: g.players
          .map((p) => `${p.name} (${p.level})`)
          .join(", "),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Player counts by level
    const allPlayers = await database
      .select({
        skillLevel: players.skillLevel,
        count: sql<number>`COUNT(*)`,
      })
      .from(players)
      .where(and(eq(players.seasonId, sid), eq(players.isActive, true)))
      .groupBy(players.skillLevel);

    const playerCounts = allPlayers
      .map((r) => ({ level: r.skillLevel, count: r.count }))
      .sort((a, b) => a.level.localeCompare(b.level));

    const startYear = season.startDate.substring(0, 4);
    const endYear = season.endDate.substring(0, 4);

    return NextResponse.json({
      seasonLabel: `${startYear}-${endYear}`,
      totalGames,
      compositions,
      acGames,
      acCount: acGames.length,
      acPct:
        totalGames > 0
          ? Math.round((acGames.length / totalGames) * 1000) / 10
          : 0,
      playerCounts,
    });
  } catch (error) {
    console.error("Composition analysis error:", error);
    return NextResponse.json(
      { error: "Failed to generate composition analysis" },
      { status: 500 }
    );
  }
}
