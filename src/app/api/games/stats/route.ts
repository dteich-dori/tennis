import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerVacations, holidays } from "@/db/schema";
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

    // --- Vacation days computation (Don's group only) ---
    const vacationDaysMap = new Map<number, number>();   // weekday vacation days (excl weekends & holidays)
    const vacationGameDaysMap = new Map<number, number>(); // game dates missed due to vacation

    if (group === "dons") {
      const playerIds = allPlayers.map((p) => p.id);

      if (playerIds.length > 0) {
        // Load vacations and holidays
        const vacRows = await database.select().from(playerVacations)
          .where(inArray(playerVacations.playerId, playerIds));
        const holidayRows = await database.select().from(holidays)
          .where(eq(holidays.seasonId, sid));

        const holidaySet = new Set(holidayRows.map((h) => h.date));

        // Load all Don's game dates for the season
        const donsGameDates = await database
          .select({ date: games.date })
          .from(games)
          .where(and(eq(games.seasonId, sid), eq(games.group, "dons"), eq(games.status, "normal")));

        // Deduplicate game dates
        const uniqueGameDates = [...new Set(donsGameDates.map((g) => g.date))];

        // Group vacations by player
        const vacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
        for (const v of vacRows) {
          const arr = vacsByPlayer.get(v.playerId) ?? [];
          arr.push(v);
          vacsByPlayer.set(v.playerId, arr);
        }

        for (const p of allPlayers) {
          const pVacs = vacsByPlayer.get(p.id) ?? [];
          if (pVacs.length === 0) continue;

          // Count weekday vacation days (exclude weekends & holidays)
          let vacDays = 0;
          for (const vac of pVacs) {
            const start = new Date(vac.startDate + "T12:00:00");
            const end = new Date(vac.endDate + "T12:00:00");
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
              const dow = d.getDay(); // 0=Sun, 6=Sat
              if (dow === 0 || dow === 6) continue; // skip weekends
              const iso = d.toISOString().substring(0, 10);
              if (holidaySet.has(iso)) continue; // skip holidays
              vacDays++;
            }
          }
          if (vacDays > 0) vacationDaysMap.set(p.id, vacDays);

          // Count Don's game dates that fall within vacation
          let gameDatesMissed = 0;
          for (const gd of uniqueGameDates) {
            if (pVacs.some((v) => gd >= v.startDate && gd <= v.endDate)) {
              gameDatesMissed++;
            }
          }
          if (gameDatesMissed > 0) vacationGameDaysMap.set(p.id, gameDatesMissed);
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
          vacationDays: vacationDaysMap.get(p.id) ?? 0,
          vacationGameDays: vacationGameDaysMap.get(p.id) ?? 0,
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
