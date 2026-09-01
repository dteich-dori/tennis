import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerVacations } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export interface VacationConflict {
  gameId: number;
  gameNumber: number;
  date: string;
  group: string;
  playerId: number;
  playerName: string;
  slotPosition: number;
  vacationStart: string;
  vacationEnd: string;
}

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const sid = parseInt(seasonId);

    const allGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, sid), eq(games.status, "normal")));

    if (allGames.length === 0) {
      return NextResponse.json({ conflicts: [], checked: 0 });
    }

    const gameIds = allGames.map((g) => g.id);
    const allAssignments = await database
      .select()
      .from(gameAssignments)
      .where(inArray(gameAssignments.gameId, gameIds));

    const assignedPlayerIds = [...new Set(allAssignments.map((a) => a.playerId))];
    if (assignedPlayerIds.length === 0) {
      return NextResponse.json({ conflicts: [], checked: 0 });
    }

    const allPlayers = await database
      .select()
      .from(players)
      .where(inArray(players.id, assignedPlayerIds));

    const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

    const vacations = await database
      .select()
      .from(playerVacations)
      .where(inArray(playerVacations.playerId, assignedPlayerIds));

    const vacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
    for (const v of vacations) {
      const existing = vacsByPlayer.get(v.playerId) ?? [];
      existing.push({ startDate: v.startDate, endDate: v.endDate });
      vacsByPlayer.set(v.playerId, existing);
    }

    const gameMap = new Map(allGames.map((g) => [g.id, g]));
    const conflicts: VacationConflict[] = [];

    for (const a of allAssignments) {
      const pVacs = vacsByPlayer.get(a.playerId);
      if (!pVacs || pVacs.length === 0) continue;
      const g = gameMap.get(a.gameId);
      if (!g) continue;
      for (const v of pVacs) {
        if (g.date >= v.startDate && g.date <= v.endDate) {
          const p = playerMap.get(a.playerId);
          conflicts.push({
            gameId: g.id,
            gameNumber: g.gameNumber,
            date: g.date,
            group: g.group,
            playerId: a.playerId,
            playerName: p ? `${p.lastName}, ${p.firstName}` : `Player #${a.playerId}`,
            slotPosition: a.slotPosition,
            vacationStart: v.startDate,
            vacationEnd: v.endDate,
          });
        }
      }
    }

    conflicts.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.gameNumber !== b.gameNumber) return a.gameNumber - b.gameNumber;
      return a.playerName.localeCompare(b.playerName);
    });

    return NextResponse.json({ conflicts, checked: allAssignments.length });
  } catch (err) {
    console.error("[games/vacation-conflicts GET] error:", err);
    return NextResponse.json(
      { error: "Failed to check vacation conflicts" },
      { status: 500 }
    );
  }
}
