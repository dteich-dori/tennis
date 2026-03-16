import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerBlockedDays, playerVacations, seasons } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

/**
 * GET /api/games/counts?seasonId=1&weekNumber=3
 * Returns per-player assignment counts:
 *   { [playerId]: { wtd: number, ytd: number, ytdDons: number, ytdSolo: number, wtdDons: number, wtdSolo: number } }
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    const weekNumber = request.nextUrl.searchParams.get("weekNumber");
    if (!seasonId || !weekNumber) {
      return NextResponse.json(
        { error: "seasonId and weekNumber required" },
        { status: 400 }
      );
    }

    const database = await db();
    const sid = parseInt(seasonId);
    const wk = parseInt(weekNumber);

    // YTD: count assignments per player per group from week 1 through the displayed week
    const ytdRows = await database
      .select({
        playerId: gameAssignments.playerId,
        group: games.group,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.status, "normal"),
          sql`${games.weekNumber} <= ${wk}`
        )
      )
      .groupBy(gameAssignments.playerId, games.group);

    // WTD: count assignments per player per group for the given week
    const wtdRows = await database
      .select({
        playerId: gameAssignments.playerId,
        group: games.group,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.weekNumber, wk),
          eq(games.status, "normal")
        )
      )
      .groupBy(gameAssignments.playerId, games.group);

    // Build result map
    const counts: Record<number, { wtd: number; ytd: number; ytdDons: number; ytdSolo: number; wtdDons: number; wtdSolo: number }> = {};

    for (const row of ytdRows) {
      if (!counts[row.playerId]) {
        counts[row.playerId] = { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
      }
      if (row.group === "dons") {
        counts[row.playerId].ytdDons += row.count;
      } else if (row.group === "solo") {
        counts[row.playerId].ytdSolo += row.count;
      }
      counts[row.playerId].ytd += row.count;
    }
    for (const row of wtdRows) {
      if (!counts[row.playerId]) {
        counts[row.playerId] = { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
      }
      if (row.group === "dons") {
        counts[row.playerId].wtdDons += row.count;
      } else if (row.group === "solo") {
        counts[row.playerId].wtdSolo += row.count;
      }
      counts[row.playerId].wtd += row.count;
    }

    // Compute vacation-aware adjusted frequency per player (front-loading look-ahead)
    const adjustedFreqs: Record<number, number> = {};
    const contractWeeks = 36;

    const allPlayers = await database.select().from(players)
      .where(and(eq(players.seasonId, sid), eq(players.isActive, true)));
    const playerIds = allPlayers.map((p) => p.id);

    if (playerIds.length > 0) {
      const blockedDaysRows = await database.select().from(playerBlockedDays)
        .where(inArray(playerBlockedDays.playerId, playerIds));
      const vacationRows = await database.select().from(playerVacations)
        .where(inArray(playerVacations.playerId, playerIds));

      const blockedByPlayer = new Map<number, number[]>();
      for (const bd of blockedDaysRows) {
        const arr = blockedByPlayer.get(bd.playerId) ?? [];
        arr.push(bd.dayOfWeek);
        blockedByPlayer.set(bd.playerId, arr);
      }
      const vacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
      for (const v of vacationRows) {
        const arr = vacsByPlayer.get(v.playerId) ?? [];
        arr.push(v);
        vacsByPlayer.set(v.playerId, arr);
      }

      // Load future Don's game dates (current week through end of season)
      const futureGameRows = await database
        .select({ weekNumber: games.weekNumber, date: games.date, dayOfWeek: games.dayOfWeek })
        .from(games)
        .where(
          and(
            eq(games.seasonId, sid),
            eq(games.group, "dons"),
            eq(games.status, "normal"),
            sql`${games.weekNumber} >= ${wk}`
          )
        );

      // Group by week: Map<weekNumber, {date, dayOfWeek}[]> (deduplicated dates)
      const datesByWeek = new Map<number, { date: string; dayOfWeek: number }[]>();
      for (const row of futureGameRows) {
        const arr = datesByWeek.get(row.weekNumber) ?? [];
        if (!arr.some((d) => d.date === row.date)) {
          arr.push({ date: row.date, dayOfWeek: row.dayOfWeek });
        }
        datesByWeek.set(row.weekNumber, arr);
      }

      for (const p of allPlayers) {
        if (p.contractedFrequency === "2+" || p.contractedFrequency === "0") continue;
        const freq = parseInt(p.contractedFrequency) || 0;
        if (freq === 0) continue;
        if (p.skillLevel === "C") continue; // no vacation makeup for C players

        const ytdDons = counts[p.id]?.ytdDons ?? 0;
        const totalTarget = freq * contractWeeks;
        const gamesNeeded = totalTarget - ytdDons;

        if (gamesNeeded <= 0) continue;

        const pVacs = vacsByPlayer.get(p.id) ?? [];
        const pBlocked = blockedByPlayer.get(p.id) ?? [];

        let playableWeeksRemaining = 0;
        for (const [, dates] of datesByWeek) {
          const hasPlayableDate = dates.some((d) => {
            if (pVacs.some((v) => d.date >= v.startDate && d.date <= v.endDate)) return false;
            if (pBlocked.includes(d.dayOfWeek)) return false;
            return true;
          });
          if (hasPlayableDate) playableWeeksRemaining++;
        }

        if (playableWeeksRemaining === 0) continue;

        let adjustedFreq = Math.ceil(gamesNeeded / playableWeeksRemaining);
        adjustedFreq = Math.min(adjustedFreq, freq + 1); // cap: at most +1 extra per week
        adjustedFreq = Math.max(adjustedFreq, freq);      // floor: never reduce below normal

        if (adjustedFreq > freq) {
          adjustedFreqs[p.id] = adjustedFreq;
        }
      }
    }

    return NextResponse.json({ counts, adjustedFreqs });
  } catch (err) {
    console.error("[games/counts GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load counts" },
      { status: 500 }
    );
  }
}
