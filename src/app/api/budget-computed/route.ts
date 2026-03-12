import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, budgetParams, courtSchedules } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

/**
 * GET /api/budget-computed?seasonId=N
 * Returns aggregated data for budget computed values:
 * - Game counts by status and group
 * - Active player counts by frequency and solo status
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const sid = parseInt(seasonId);

    // Count games by status and group
    const gameCounts = await database
      .select({
        status: games.status,
        group: games.group,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(games)
      .where(eq(games.seasonId, sid))
      .groupBy(games.status, games.group);

    let normalDonsGames = 0;
    let normalSoloGames = 0;
    let holidayGames = 0;
    for (const row of gameCounts) {
      if (row.status === "normal" && row.group === "dons") normalDonsGames = row.count;
      if (row.status === "normal" && row.group === "solo") normalSoloGames = row.count;
      if (row.status === "holiday") holidayGames += row.count;
    }

    // Count active players by frequency
    const allPlayers = await database
      .select({
        contractedFrequency: players.contractedFrequency,
        soloGames: players.soloGames,
        isActive: players.isActive,
        isSub: players.contractedFrequency,
      })
      .from(players)
      .where(and(eq(players.seasonId, sid), eq(players.isActive, true)));

    let dons0 = 0, dons1 = 0, dons2 = 0, dons2plus = 0, soloCount = 0;
    let totalSoloGamesFromDB = 0;
    for (const p of allPlayers) {
      if (p.contractedFrequency === "0") dons0++;
      else if (p.contractedFrequency === "1") dons1++;
      else if (p.contractedFrequency === "2") dons2++;
      else if (p.contractedFrequency === "2+") dons2plus++;
      if (p.soloGames != null && p.soloGames > 0) {
        soloCount++;
        totalSoloGamesFromDB += p.soloGames;
      }
    }

    // Get individual solo player details for budget display
    const soloPlayerRows = await database
      .select({
        firstName: players.firstName,
        lastName: players.lastName,
        soloGames: players.soloGames,
      })
      .from(players)
      .where(and(eq(players.seasonId, sid), eq(players.isActive, true)));
    const soloPlayers = soloPlayerRows
      .filter((p) => p.soloGames != null && p.soloGames > 0)
      .map((p) => ({ name: `${p.firstName} ${p.lastName}`, soloGames: p.soloGames! }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Calculate extra games for 2+ players
    // Base contract = 2 games/week. Extra = total assignments - (2 × weeksPerSeason) per player.
    let extraGames2plus = 0;
    if (dons2plus > 0) {
      // Get weeksPerSeason from budget params (or default 36)
      const bpRows = await database
        .select({ weeksPerSeason: budgetParams.weeksPerSeason })
        .from(budgetParams)
        .where(eq(budgetParams.seasonId, sid));
      const weeksPerSeason = bpRows.length > 0 ? bpRows[0].weeksPerSeason : 36;

      // We need actual player IDs — re-query with IDs
      const plus2Rows = await database
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.seasonId, sid), eq(players.isActive, true), eq(players.contractedFrequency, "2+")));
      const plus2Ids = plus2Rows.map((r) => r.id);

      if (plus2Ids.length > 0) {
        // Count Don's game assignments per 2+ player (only normal Don's games)
        const assignCounts = await database
          .select({
            playerId: gameAssignments.playerId,
            count: sql<number>`count(*)`.as("count"),
          })
          .from(gameAssignments)
          .innerJoin(games, eq(gameAssignments.gameId, games.id))
          .where(
            and(
              eq(games.seasonId, sid),
              eq(games.group, "dons"),
              eq(games.status, "normal"),
              inArray(gameAssignments.playerId, plus2Ids)
            )
          )
          .groupBy(gameAssignments.playerId);

        const baseGamesPerPlayer = 2 * weeksPerSeason;
        for (const row of assignCounts) {
          const extra = Math.max(0, row.count - baseGamesPerPlayer);
          extraGames2plus += extra;
        }
      }
    }

    // Count total game assignments for subs (0x/week players)
    let subsGameCount = 0;
    if (dons0 > 0) {
      const subRows = await database
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.seasonId, sid), eq(players.isActive, true), eq(players.contractedFrequency, "0")));
      const subIds = subRows.map((r) => r.id);

      if (subIds.length > 0) {
        const subAssignResult = await database
          .select({ count: sql<number>`count(*)`.as("count") })
          .from(gameAssignments)
          .innerJoin(games, eq(gameAssignments.gameId, games.id))
          .where(
            and(
              eq(games.seasonId, sid),
              eq(games.group, "dons"),
              eq(games.status, "normal"),
              inArray(gameAssignments.playerId, subIds)
            )
          );
        subsGameCount = subAssignResult[0]?.count ?? 0;
      }
    }

    // Count court slots per week from the court schedule
    const courtSlotCounts = await database
      .select({
        isSolo: courtSchedules.isSolo,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(courtSchedules)
      .where(eq(courtSchedules.seasonId, sid))
      .groupBy(courtSchedules.isSolo);

    let donsCourtsPerWeek = 0;
    let soloCourtsPerWeek = 0;
    for (const row of courtSlotCounts) {
      if (row.isSolo) soloCourtsPerWeek = row.count;
      else donsCourtsPerWeek = row.count;
    }

    return NextResponse.json({
      normalDonsGames,
      normalSoloGames,
      normalGameCount: normalDonsGames + normalSoloGames,
      holidayGames,
      playerCounts: { dons0, dons1, dons2, dons2plus, solo: soloCount },
      extraGames2plus,
      subsGameCount,
      totalSoloGamesFromDB,
      soloPlayers,
      donsCourtsPerWeek,
      soloCourtsPerWeek,
    });
  } catch (err) {
    console.error("[budget-computed GET] error:", err);
    return NextResponse.json({ error: "Failed to compute budget data" }, { status: 500 });
  }
}
