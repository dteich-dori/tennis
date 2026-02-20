import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * GET /api/games/extra?seasonId=1
 * Returns a list of "extra" Don's games — games where a player was assigned
 * beyond their contracted weekly frequency.
 *
 * For each week, if a player with frequency N has more than N assignments,
 * the extra games (beyond the first N) are returned.
 *
 * Response: { rows: ExtraGameRow[], currentMaxWeek: number }
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const sid = parseInt(seasonId);

    // Load active players for the season
    const allPlayers = await database
      .select()
      .from(players)
      .where(and(eq(players.seasonId, sid), eq(players.isActive, true)));

    const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

    // Get the highest week number that has any Don's assignments
    const [maxWeekRow] = await database
      .select({
        maxWeek: sql<number>`max(${games.weekNumber})`.as("maxWeek"),
      })
      .from(games)
      .innerJoin(gameAssignments, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.status, "normal"),
          eq(games.group, "dons")
        )
      );

    const currentMaxWeek = maxWeekRow?.maxWeek ?? 0;

    // Fetch all Don's normal game assignments with game details
    const assignmentRows = await database
      .select({
        playerId: gameAssignments.playerId,
        gameId: games.id,
        gameNumber: games.gameNumber,
        weekNumber: games.weekNumber,
        date: games.date,
        dayOfWeek: games.dayOfWeek,
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.status, "normal"),
          eq(games.group, "dons")
        )
      );

    // Group assignments by playerId -> weekNumber -> list of game details
    const playerWeekGames = new Map<number, Map<number, { gameId: number; gameNumber: number; date: string; dayOfWeek: number }[]>>();
    for (const row of assignmentRows) {
      if (!playerWeekGames.has(row.playerId)) {
        playerWeekGames.set(row.playerId, new Map());
      }
      const weekMap = playerWeekGames.get(row.playerId)!;
      if (!weekMap.has(row.weekNumber)) {
        weekMap.set(row.weekNumber, []);
      }
      weekMap.get(row.weekNumber)!.push({
        gameId: row.gameId,
        gameNumber: row.gameNumber,
        date: row.date,
        dayOfWeek: row.dayOfWeek,
      });
    }

    // Now load all assignments keyed by gameId so we can get all 4 players per game
    const allAssignments = await database
      .select({
        gameId: gameAssignments.gameId,
        playerId: gameAssignments.playerId,
        slotPosition: gameAssignments.slotPosition,
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.status, "normal"),
          eq(games.group, "dons")
        )
      );

    const gamePlayerMap = new Map<number, { playerId: number; slotPosition: number }[]>();
    for (const a of allAssignments) {
      if (!gamePlayerMap.has(a.gameId)) {
        gamePlayerMap.set(a.gameId, []);
      }
      gamePlayerMap.get(a.gameId)!.push({ playerId: a.playerId, slotPosition: a.slotPosition });
    }

    // Helper to get player display name
    function getPlayerName(playerId: number): string {
      const player = playerMap.get(playerId);
      if (!player) return "—";
      const sameLastName = allPlayers.filter(
        (p) => p.lastName === player.lastName && p.id !== player.id
      );
      if (sameLastName.length > 0) {
        return `${player.lastName}, ${player.firstName.charAt(0)}.`;
      }
      return player.lastName;
    }

    // Build the extra games rows
    interface ExtraGameRow {
      playerName: string;
      playerId: number;
      gameNumber: number;
      gameId: number;
      date: string;
      dayOfWeek: number;
      players: string[];
      weekNumber: number;
    }

    const extraRows: ExtraGameRow[] = [];

    for (const [playerId, weekMap] of playerWeekGames) {
      const player = playerMap.get(playerId);
      if (!player) continue;

      const freq = parseInt(player.contractedFrequency) || 0;
      // Only contracted players can have "extra" games
      if (freq === 0) continue;

      for (const [weekNumber, weekGames] of weekMap) {
        if (weekGames.length <= freq) continue;

        // Sort games by date, then game number
        weekGames.sort((a, b) => a.date.localeCompare(b.date) || a.gameNumber - b.gameNumber);

        // Games beyond the first `freq` are extras
        const extras = weekGames.slice(freq);
        for (const g of extras) {
          // Get all 4 players for this game
          const gamePlayers = (gamePlayerMap.get(g.gameId) ?? [])
            .sort((a, b) => a.slotPosition - b.slotPosition)
            .map((a) => getPlayerName(a.playerId));

          // Pad to 4 slots
          while (gamePlayers.length < 4) {
            gamePlayers.push("—");
          }

          extraRows.push({
            playerName: getPlayerName(playerId),
            playerId,
            gameNumber: g.gameNumber,
            gameId: g.gameId,
            date: g.date,
            dayOfWeek: g.dayOfWeek,
            players: gamePlayers,
            weekNumber,
          });
        }
      }
    }

    // Sort by player name, then date
    extraRows.sort((a, b) => a.playerName.localeCompare(b.playerName) || a.date.localeCompare(b.date) || a.gameNumber - b.gameNumber);

    return NextResponse.json({
      rows: extraRows,
      currentMaxWeek,
    });
  } catch (err) {
    console.error("[games/extra GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load extra games" },
      { status: 500 }
    );
  }
}
