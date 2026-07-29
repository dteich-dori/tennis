import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, seasons } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * GET /api/admin/find-same-date-conflicts?seasonId=N
 *
 * Finds every player who is assigned to MORE than one game on the same
 * date (Solo + Don's, two Don's, etc.). Returns a report the admin can
 * use to spot-check the season BEFORE running auto-assign again — the
 * v1.207 fixes prevent NEW conflicts but don't remove existing ones.
 *
 * Response:
 * {
 *   conflicts: [
 *     { date, playerId, playerName, games: [{ id, gameNumber, group, court, startTime }] }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const seasonIdParam = request.nextUrl.searchParams.get("seasonId");
    const database = await db();
    let seasonId = seasonIdParam ? parseInt(seasonIdParam) : null;
    if (!seasonId) {
      const s = await database.select({ id: seasons.id }).from(seasons);
      seasonId = s.length > 0 ? s[s.length - 1].id : null;
    }
    if (!seasonId) return NextResponse.json({ error: "No season." }, { status: 400 });

    const allGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.status, "normal")));
    const gameIds = allGames.map((g) => g.id);
    const gameById = new Map(allGames.map((g) => [g.id, g]));
    if (gameIds.length === 0) {
      return NextResponse.json({ seasonId, conflicts: [] });
    }
    const assignments = await database
      .select({ playerId: gameAssignments.playerId, gameId: gameAssignments.gameId })
      .from(gameAssignments)
      .where(inArray(gameAssignments.gameId, gameIds));

    // Group by playerId → date → list of game ids
    const byPlayerDate = new Map<string, number[]>();
    for (const a of assignments) {
      const g = gameById.get(a.gameId);
      if (!g) continue;
      const key = `${a.playerId}|${g.date}`;
      const arr = byPlayerDate.get(key) ?? [];
      arr.push(a.gameId);
      byPlayerDate.set(key, arr);
    }

    // Only entries with more than 1 game
    const conflictKeys = [...byPlayerDate.entries()].filter(([, ids]) => ids.length > 1);
    if (conflictKeys.length === 0) {
      return NextResponse.json({ seasonId, conflicts: [] });
    }

    const conflictPlayerIds = [...new Set(conflictKeys.map(([k]) => Number(k.split("|")[0])))];
    const playerRows = await database
      .select({ id: players.id, firstName: players.firstName, lastName: players.lastName })
      .from(players)
      .where(inArray(players.id, conflictPlayerIds));
    const playerById = new Map(playerRows.map((p) => [p.id, p]));

    const conflicts = conflictKeys.map(([key, gIds]) => {
      const [pidStr, date] = key.split("|");
      const pid = Number(pidStr);
      const p = playerById.get(pid);
      return {
        date,
        playerId: pid,
        playerName: p ? `${p.lastName}, ${p.firstName}` : `player #${pid}`,
        games: gIds
          .map((id) => gameById.get(id))
          .filter((g): g is NonNullable<typeof g> => !!g)
          .map((g) => ({
            id: g.id,
            gameNumber: g.gameNumber,
            group: g.group,
            weekNumber: g.weekNumber,
            court: g.courtNumber,
            startTime: g.startTime,
          }))
          .sort((a, b) => (a.group === "solo" ? -1 : 1)),
      };
    }).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.playerName.localeCompare(b.playerName);
    });

    return NextResponse.json({ seasonId, conflicts });
  } catch (err) {
    console.error("[find-same-date-conflicts GET] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
