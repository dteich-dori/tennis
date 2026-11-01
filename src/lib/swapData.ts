import { inArray, eq } from "drizzle-orm";
import { db } from "@/db/getDb";
import {
  players,
  games,
  gameAssignments,
  playerBlockedDays,
  playerVacations,
  playerDoNotPair,
} from "@/db/schema";
import { firstPerSlot } from "@/lib/dedupeAssignments";
import type { SwapPlayer, SwapGame } from "@/lib/swapSuggestions";

/**
 * A season's players and games in the shapes lib/swapSuggestions judges, so
 * a server route can re-run exactly the eligibility the screen used.
 */
export async function loadSwapData(
  database: Awaited<ReturnType<typeof db>>,
  seasonId: number
): Promise<{ swapPlayers: SwapPlayer[]; swapGames: SwapGame[] }> {
  const [pRows, gRows] = await Promise.all([
    database.select().from(players).where(eq(players.seasonId, seasonId)),
    database.select().from(games).where(eq(games.seasonId, seasonId)),
  ]);
  const playerIds = pRows.map((p) => p.id);
  const gameIds = gRows.map((g) => g.id);

  const BATCH = 50;
  const aRows: (typeof gameAssignments.$inferSelect)[] = [];
  for (let i = 0; i < gameIds.length; i += BATCH) {
    aRows.push(
      ...(await database
        .select()
        .from(gameAssignments)
        .where(inArray(gameAssignments.gameId, gameIds.slice(i, i + BATCH))))
    );
  }
  const [blocked, vacs, dnp] = playerIds.length
    ? await Promise.all([
        database.select().from(playerBlockedDays).where(inArray(playerBlockedDays.playerId, playerIds)),
        database.select().from(playerVacations).where(inArray(playerVacations.playerId, playerIds)),
        database.select().from(playerDoNotPair).where(inArray(playerDoNotPair.playerId, playerIds)),
      ])
    : [[], [], []];

  const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
    const a = m.get(k) ?? [];
    a.push(v);
    m.set(k, a);
  };
  const blockedBy = new Map<number, number[]>();
  for (const b of blocked) push(blockedBy, b.playerId, b.dayOfWeek);
  const vacsBy = new Map<number, { startDate: string; endDate: string }[]>();
  for (const v of vacs) push(vacsBy, v.playerId, { startDate: v.startDate, endDate: v.endDate });
  const dnpBy = new Map<number, number[]>();
  for (const d of dnp) push(dnpBy, d.playerId, d.pairedPlayerId);
  const assignBy = new Map<number, typeof aRows>();
  for (const a of aRows) push(assignBy, a.gameId, a);

  const swapPlayers: SwapPlayer[] = pRows.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    isActive: p.isActive,
    skillLevel: p.skillLevel,
    contractedFrequency: p.contractedFrequency,
    soloGames: p.soloGames,
    noEarlyGames: p.noEarlyGames,
    blockedDays: blockedBy.get(p.id) ?? [],
    vacations: vacsBy.get(p.id) ?? [],
    doNotPair: dnpBy.get(p.id) ?? [],
  }));
  const swapGames: SwapGame[] = gRows.map((g) => ({
    id: g.id,
    gameNumber: g.gameNumber,
    date: g.date,
    dayOfWeek: g.dayOfWeek,
    startTime: g.startTime,
    courtNumber: g.courtNumber,
    weekNumber: g.weekNumber,
    status: g.status,
    group: g.group,
    assignments: firstPerSlot(assignBy.get(g.id) ?? []).map((a) => ({ playerId: a.playerId })),
  }));
  return { swapPlayers, swapGames };
}
