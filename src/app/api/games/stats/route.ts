import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerVacations, playerBlockedDays, holidays } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

/**
 * GET /api/games/stats?seasonId=1&group=dons
 * Returns per-player statistics for the entire season filtered by group:
 *   - std: season-total games assigned (all weeks)
 *   - contracted: contracted frequency
 *   - expectedStd: freq * weeksWithAssignments
 *   - deficit: expectedStd - std
 *   - weeklyBreakdown: games per week
 *   - ballsBrought: slot 1 count (ball-bringing duty)
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    const group = request.nextUrl.searchParams.get("group"); // "dons" or "solo"
    if (!seasonId) {
      return NextResponse.json(
        { error: "seasonId required" },
        { status: 400 }
      );
    }

    const database = await db();
    const sid = parseInt(seasonId);

    // Base game filter: season + normal status + optional group
    const gameFilter = group
      ? and(eq(games.seasonId, sid), eq(games.status, "normal"), eq(games.group, group))
      : and(eq(games.seasonId, sid), eq(games.status, "normal"));

    // Load all active players, filtered by group eligibility
    const allPlayersRaw = await database
      .select()
      .from(players)
      .where(and(eq(players.seasonId, sid), eq(players.isActive, true)));

    // For solo group, only include players with soloGames > 0
    const allPlayers = group === "solo"
      ? allPlayersRaw.filter((p) => p.soloGames != null && p.soloGames > 0)
      : allPlayersRaw;

    // Get the highest week number that has any assignments (current progress)
    const [maxWeekRow] = await database
      .select({
        maxWeek: sql<number>`max(${games.weekNumber})`.as("maxWeek"),
      })
      .from(games)
      .innerJoin(gameAssignments, eq(gameAssignments.gameId, games.id))
      .where(gameFilter);

    const currentMaxWeek = maxWeekRow?.maxWeek ?? 0;

    // STD (Season-Total-to-Date) count per player — all weeks in the season
    const ytdRows = await database
      .select({
        playerId: gameAssignments.playerId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(gameFilter)
      .groupBy(gameAssignments.playerId);

    const stdMap = new Map<number, number>();
    for (const row of ytdRows) {
      stdMap.set(row.playerId, row.count);
    }

    // Ball-bringing count (slot 1 assignments) per player
    const ballFilter = group
      ? and(eq(games.seasonId, sid), eq(games.status, "normal"), eq(games.group, group), eq(gameAssignments.slotPosition, 1))
      : and(eq(games.seasonId, sid), eq(games.status, "normal"), eq(gameAssignments.slotPosition, 1));

    const ballRows = await database
      .select({
        playerId: gameAssignments.playerId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(ballFilter)
      .groupBy(gameAssignments.playerId);

    const ballMap = new Map<number, number>();
    for (const row of ballRows) {
      ballMap.set(row.playerId, row.count);
    }

    // Per-week counts per player
    const weeklyRows = await database
      .select({
        playerId: gameAssignments.playerId,
        weekNumber: games.weekNumber,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(gameFilter)
      .groupBy(gameAssignments.playerId, games.weekNumber);

    const weeklyMap = new Map<number, Record<number, number>>();
    for (const row of weeklyRows) {
      if (!weeklyMap.has(row.playerId)) {
        weeklyMap.set(row.playerId, {});
      }
      weeklyMap.get(row.playerId)![row.weekNumber] = row.count;
    }

    // Contractual weeks (solo and Don's share the same 36-week base)
    const CONTRACT_WEEKS = 36;

    // Wednesday game count per player (solo group only — for Tue/Wed split tracking)
    const wednesdayMap = new Map<number, number>();
    if (group === "solo") {
      const wednesdayFilter = and(
        eq(games.seasonId, sid),
        eq(games.status, "normal"),
        eq(games.group, "solo"),
        eq(games.dayOfWeek, 3) // Wednesday
      );
      const wednesdayRows = await database
        .select({
          playerId: gameAssignments.playerId,
          count: sql<number>`count(*)`.as("count"),
        })
        .from(gameAssignments)
        .innerJoin(games, eq(gameAssignments.gameId, games.id))
        .where(wednesdayFilter)
        .groupBy(gameAssignments.playerId);

      for (const row of wednesdayRows) {
        wednesdayMap.set(row.playerId, row.count);
      }
    }

    // Count incomplete games (normal games with fewer than 4 assignments)
    const incompleteRows = await database
      .select({
        gameId: games.id,
        assignmentCount: sql<number>`count(${gameAssignments.id})`.as("assignmentCount"),
      })
      .from(games)
      .leftJoin(gameAssignments, eq(gameAssignments.gameId, games.id))
      .where(gameFilter)
      .groupBy(games.id)
      .having(sql`count(${gameAssignments.id}) < 4`);

    const incompleteGameCount = incompleteRows.length;

    // --- Vacation games lost computation (Don's group only) ---
    // Per week: count game dates in vacation that are NOT blocked days and NOT holidays,
    // then cap at the player's contract frequency. Sum across all weeks.
    const vacationGamesLostMap = new Map<number, number>();

    if (group === "dons") {
      const playerIds = allPlayers.map((p) => p.id);

      if (playerIds.length > 0) {
        // Load vacations, blocked days, and holidays
        const vacRows = await database.select().from(playerVacations)
          .where(inArray(playerVacations.playerId, playerIds));
        const blockedRows = await database.select().from(playerBlockedDays)
          .where(inArray(playerBlockedDays.playerId, playerIds));
        const holidayRows = await database.select().from(holidays)
          .where(eq(holidays.seasonId, sid));

        const holidaySet = new Set(holidayRows.map((h) => h.date));

        // Load all Don's game dates + week numbers for the season
        const donsGameRows = await database
          .select({ date: games.date, weekNumber: games.weekNumber, dayOfWeek: games.dayOfWeek })
          .from(games)
          .where(and(eq(games.seasonId, sid), eq(games.group, "dons"), eq(games.status, "normal")));

        // Deduplicate by date, keeping weekNumber and dayOfWeek
        const seenDates = new Set<string>();
        const uniqueGameDates: { date: string; weekNumber: number; dayOfWeek: number }[] = [];
        for (const g of donsGameRows) {
          if (!seenDates.has(g.date)) {
            seenDates.add(g.date);
            uniqueGameDates.push({ date: g.date, weekNumber: g.weekNumber, dayOfWeek: g.dayOfWeek });
          }
        }

        // Group vacations by player
        const vacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
        for (const v of vacRows) {
          const arr = vacsByPlayer.get(v.playerId) ?? [];
          arr.push(v);
          vacsByPlayer.set(v.playerId, arr);
        }

        // Group blocked days by player
        const blockedByPlayer = new Map<number, Set<number>>();
        for (const b of blockedRows) {
          const s = blockedByPlayer.get(b.playerId) ?? new Set();
          s.add(b.dayOfWeek);
          blockedByPlayer.set(b.playerId, s);
        }

        for (const p of allPlayers) {
          const pVacs = vacsByPlayer.get(p.id) ?? [];
          if (pVacs.length === 0) continue;

          const pBlocked = blockedByPlayer.get(p.id) ?? new Set();
          const freq = p.contractedFrequency === "2+" ? 2 : (parseInt(p.contractedFrequency) || 0);
          if (freq === 0) continue;

          // Group effective vacation game dates by week
          const vacDatesByWeek = new Map<number, number>();
          for (const gd of uniqueGameDates) {
            // Skip if not during a vacation
            if (!pVacs.some((v) => gd.date >= v.startDate && gd.date <= v.endDate)) continue;
            // Skip if this day is already blocked (player wouldn't have played anyway)
            if (pBlocked.has(gd.dayOfWeek)) continue;
            // Skip if this date is a holiday
            if (holidaySet.has(gd.date)) continue;

            vacDatesByWeek.set(gd.weekNumber, (vacDatesByWeek.get(gd.weekNumber) ?? 0) + 1);
          }

          // Sum: min(freq, effective vacation dates) per week
          let gamesLost = 0;
          for (const count of vacDatesByWeek.values()) {
            gamesLost += Math.min(freq, count);
          }
          if (gamesLost > 0) vacationGamesLostMap.set(p.id, gamesLost);
        }
      }
    }

    // Build stats
    const stats = allPlayers
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
      .map((p) => {
        // Use soloGames target for solo group, contracted frequency for dons
        const std = stdMap.get(p.id) ?? 0;
        let expectedStd: number;
        if (group === "solo") {
          // Expected games proportional to progress through season
          const soloTarget = p.soloGames ?? 0;
          expectedStd = (soloTarget / CONTRACT_WEEKS) * Math.min(currentMaxWeek, CONTRACT_WEEKS);
        } else {
          const freq = parseInt(p.contractedFrequency) || 0;
          expectedStd = freq * Math.min(currentMaxWeek, CONTRACT_WEEKS);
        }
        const deficit = expectedStd - std;
        const ballsBrought = ballMap.get(p.id) ?? 0;
        const weeksPlayed = Object.keys(weeklyMap.get(p.id) ?? {}).length;

        return {
          playerId: p.id,
          lastName: p.lastName,
          firstName: p.firstName,
          frequency: p.contractedFrequency,
          skillLevel: p.skillLevel,
          soloGames: p.soloGames,
          std,
          expectedStd,
          deficit,
          ballsBrought,
          weeksPlayed,
          wednesdayCount: wednesdayMap.get(p.id) ?? 0,
          vacationGamesLost: vacationGamesLostMap.get(p.id) ?? 0,
          madeUpVac: (() => {
            // Count weeks where assigned games exceed contracted frequency
            const freq = p.contractedFrequency === "2+" ? 2 : (parseInt(p.contractedFrequency) || 0);
            if (freq === 0) return 0;
            const weekly = weeklyMap.get(p.id) ?? {};
            let surplus = 0;
            for (const count of Object.values(weekly)) {
              if (count > freq) surplus += count - freq;
            }
            return surplus;
          })(),
        };
      });

    return NextResponse.json({
      stats,
      currentMaxWeek,
      totalPlayers: allPlayers.length,
      incompleteGameCount,
    });
  } catch (err) {
    console.error("[games/stats GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load stats" },
      { status: 500 }
    );
  }
}
