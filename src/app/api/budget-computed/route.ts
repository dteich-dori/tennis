import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, budgetParams, courtSchedules } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { countPerPlayer } from "@/lib/dedupeAssignments";

/**
 * Active, billable players for a season: excludes anyone flagged
 * no_charge, who is comped and must never contribute to projected
 * income (season fee or per-game fee).
 */
function billable(seasonId: number) {
  return and(
    eq(players.seasonId, seasonId),
    eq(players.isActive, true),
    eq(players.noCharge, false)
  );
}

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

    // Count active players by frequency.
    //  Players flagged no_charge are comped — they pay neither a season
    //  fee nor a per-game fee — so they must not appear in any of the
    //  counts below, all of which are multiplied by a price to project
    //  income on the Budget page. Every query in this route filters them
    //  out for the same reason.
    const allPlayers = await database
      .select({
        contractedFrequency: players.contractedFrequency,
        soloGames: players.soloGames,
        isActive: players.isActive,
        isSub: players.contractedFrequency,
      })
      .from(players)
      .where(billable(sid));

    let dons0 = 0, dons1 = 0, dons1plus = 0, dons2 = 0, dons2plus = 0, soloCount = 0;
    let totalSoloGamesFromDB = 0;
    for (const p of allPlayers) {
      if (p.contractedFrequency === "0") dons0++;
      else if (p.contractedFrequency === "1") dons1++;
      else if (p.contractedFrequency === "1+") dons1plus++;
      else if (p.contractedFrequency === "2") dons2++;
      else if (p.contractedFrequency === "2+") dons2plus++;
      if (p.soloGames != null && p.soloGames > 0) {
        soloCount++;
        totalSoloGamesFromDB += p.soloGames;
      }
    }

    // Get individual solo player details for budget display
    //  id and soloDeposit come along so the Solo tab can show each
    //  player's deposit and balance due, and write the deposit back.
    const soloPlayerRows = await database
      .select({
        id: players.id,
        firstName: players.firstName,
        lastName: players.lastName,
        soloGames: players.soloGames,
        soloDeposit: players.soloDeposit,
        soloCredit: players.soloCredit,
      })
      .from(players)
      .where(billable(sid));
    const soloPlayers = soloPlayerRows
      .filter((p) => p.soloGames != null && p.soloGames > 0)
      .map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        soloGames: p.soloGames!,
        soloDeposit: p.soloDeposit ?? 0,
        soloCredit: p.soloCredit ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Get weeksPerSeason from budget params (or default 36) — needed by
    // both the 2+ and 1+ extra-games calculations below.
    const bpRows = await database
      .select({ weeksPerSeason: budgetParams.weeksPerSeason })
      .from(budgetParams)
      .where(eq(budgetParams.seasonId, sid));
    const weeksPerSeason = bpRows.length > 0 ? bpRows[0].weeksPerSeason : 36;

    //  `game_assignments` holds duplicate rows for some (game, slot) pairs —
    //  see lib/dedupeAssignments.ts. The three blocks below used to run
    //  `count(*)`, which counted those duplicates as billable extra games.
    //  Fetch every Don's/normal row for the season once, keep only the rows
    //  the Schedule grid displays, and tally per player. The dedupe must see
    //  ALL rows of a (game, slot) — never filter by player first, or a
    //  player's second-place row gets promoted and counted.
    const seasonAssignmentRows = await database
      .select({
        id: gameAssignments.id,
        gameId: gameAssignments.gameId,
        slotPosition: gameAssignments.slotPosition,
        playerId: gameAssignments.playerId,
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.group, "dons"),
          eq(games.status, "normal")
        )
      );
    const donsGamesByPlayerId = countPerPlayer(seasonAssignmentRows);

    // Calculate extra games for 2+ players
    // Base contract = 2 games/week. Extra = total assignments - (2 × weeksPerSeason) per player.
    let extraGames2plus = 0;
    if (dons2plus > 0) {
      // We need actual player IDs — re-query with IDs
      const plus2Rows = await database
        .select({ id: players.id })
        .from(players)
        .where(and(billable(sid), eq(players.contractedFrequency, "2+")));
      const plus2Ids = plus2Rows.map((r) => r.id);

      if (plus2Ids.length > 0) {
        const baseGamesPerPlayer = 2 * weeksPerSeason;
        for (const pid of plus2Ids) {
          const played = donsGamesByPlayerId.get(pid) ?? 0;
          extraGames2plus += Math.max(0, played - baseGamesPerPlayer);
        }
      }
    }

    // Calculate extra games for 1+ players (same idea as 2+, but base
    // contract is 1 game/week). Per the player-manual note, a 1+
    // player's extras beyond their guaranteed weekly game are priced
    // at the sub rate, not the 2+ extra-hour rate — the frontend picks
    // the right price param, this endpoint just supplies the count.
    let extraGames1plus = 0;
    if (dons1plus > 0) {
      const plus1Rows = await database
        .select({ id: players.id })
        .from(players)
        .where(and(billable(sid), eq(players.contractedFrequency, "1+")));
      const plus1Ids = plus1Rows.map((r) => r.id);

      if (plus1Ids.length > 0) {
        const baseGamesPerPlayer = 1 * weeksPerSeason;
        for (const pid of plus1Ids) {
          const played = donsGamesByPlayerId.get(pid) ?? 0;
          extraGames1plus += Math.max(0, played - baseGamesPerPlayer);
        }
      }
    }

    // Count total game assignments for subs (0x/week players)
    let subsGameCount = 0;
    if (dons0 > 0) {
      const subRows = await database
        .select({ id: players.id })
        .from(players)
        .where(and(billable(sid), eq(players.contractedFrequency, "0")));
      const subIds = subRows.map((r) => r.id);

      if (subIds.length > 0) {
        for (const pid of subIds) {
          subsGameCount += donsGamesByPlayerId.get(pid) ?? 0;
        }
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
      playerCounts: { dons0, dons1, dons1plus, dons2, dons2plus, solo: soloCount },
      extraGames2plus,
      extraGames1plus,
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
