/**
 * Server-side: load every input the playerAccountSummary helper needs and
 * return the per-player summaries for a season. Used by the Communications
 * preview + send endpoints to populate {balance}, {deposits}, etc.
 */

import { db } from "@/db/getDb";
import {
  players,
  playerPayments,
  games,
  gameAssignments,
  budgetParams,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  computeAccountSummaries,
  type AccountSummary,
} from "./playerAccountSummary";
import { firstPerSlot } from "./dedupeAssignments";

interface LoadResult {
  summaries: AccountSummary[];
  byPlayerId: Map<number, AccountSummary>;
  rates: {
    priceDons1: number;
    priceDons2: number;
    priceExtraHour: number;
    priceSubs: number;
    priceSolo: number;
  };
  baseWeeks: number;
}

export async function loadAccountSummariesForSeason(
  seasonId: number
): Promise<LoadResult> {
  const database = await db();

  // 1. All players for the season (we'll filter active inside the helper)
  const allPlayers = await database
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      contractedFrequency: players.contractedFrequency,
      isActive: players.isActive,
      noCharge: players.noCharge,
      priorYearCredit: players.priorYearCredit,
      soloGames: players.soloGames,
      soloDeposit: players.soloDeposit,
      soloCredit: players.soloCredit,
    })
    .from(players)
    .where(eq(players.seasonId, seasonId));

  const playerIds = allPlayers.map((p) => p.id);

  // 2. Payments for those players
  const allPayments =
    playerIds.length > 0
      ? await database
          .select({
            playerId: playerPayments.playerId,
            amount: playerPayments.amount,
          })
          .from(playerPayments)
          .where(inArray(playerPayments.playerId, playerIds))
      : [];

  // 3. Don's normal-status game assignments for the season — joined to games
  //    so we can filter by status='normal' and group='dons'
  //  NOTE: `game_assignments` holds duplicate rows for some (game, slot)
  //  pairs — see lib/dedupeAssignments.ts. Counting raw rows here billed
  //  players for games their schedule never showed them in, so we pull the
  //  slot keys too and keep only the rows the Schedule grid displays.
  const rawAssignments =
    playerIds.length > 0
      ? await database
          .select({
            id: gameAssignments.id,
            gameId: gameAssignments.gameId,
            slotPosition: gameAssignments.slotPosition,
            playerId: gameAssignments.playerId,
            gameStatus: games.status,
            gameGroup: games.group,
          })
          .from(gameAssignments)
          .innerJoin(games, eq(games.id, gameAssignments.gameId))
          .where(
            and(
              eq(games.seasonId, seasonId),
              eq(games.group, "dons"),
              eq(games.status, "normal")
            )
          )
      : [];

  //  IMPORTANT: no playerId filter above, deliberately. The dedupe has to see
  //  EVERY row of a (game, slot) to know which one wins. Filtering to one
  //  player first would promote their second-place row to first and bill it.
  //  computeAccountSummaries only looks up the players it was given, so the
  //  extra rows cost nothing.
  const allAssignments = firstPerSlot(rawAssignments);

  // 4. Budget params (rates + baseWeeks)
  const params = await database
    .select()
    .from(budgetParams)
    .where(eq(budgetParams.seasonId, seasonId));
  const p = params[0];

  const rates = {
    priceDons1: p?.priceDons1 ?? 0,
    priceDons2: p?.priceDons2 ?? 0,
    priceExtraHour: p?.priceExtraHour ?? 0,
    priceSubs: p?.priceSubs ?? 0,
    priceSolo: p?.priceSolo ?? 0,
  };
  const baseWeeks = p?.weeksPerSeason ?? 36;

  const summaries = computeAccountSummaries({
    players: allPlayers,
    payments: allPayments,
    donsNormalAssignments: allAssignments,
    rates,
    baseWeeks,
  });

  const byPlayerId = new Map<number, AccountSummary>();
  for (const s of summaries) byPlayerId.set(s.playerId, s);

  return { summaries, byPlayerId, rates, baseWeeks };
}
