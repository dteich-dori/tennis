import { db } from "@/db/getDb";
import { players, playerPayments } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Standard deposit amounts per contract tier. Mirrors the constants used by
 * the Accounts tab "Add Standard Deposits" macro.
 */
export const STANDARD_DEPOSIT: Record<string, number> = {
  "1": 500,
  "2": 750,
  "2+": 750,
};

/**
 * Returns the IDs of active contract players (1x / 2x / 2x+) whose total
 * deposits paid so far are LESS than their tier's standard deposit. Subs
 * are intentionally excluded — they don't pay a deposit.
 */
export async function getPlayerIdsBelowStandardDeposit(
  seasonId: number
): Promise<Set<number>> {
  const database = await db();

  // Active contract players
  const seasonPlayers = await database
    .select({
      id: players.id,
      contractedFrequency: players.contractedFrequency,
    })
    .from(players)
    .where(
      and(eq(players.seasonId, seasonId), eq(players.isActive, true))
    );

  const contractPlayers = seasonPlayers.filter(
    (p) => p.contractedFrequency in STANDARD_DEPOSIT
  );

  if (contractPlayers.length === 0) return new Set();

  // Load all payments for these players
  const ids = contractPlayers.map((p) => p.id);
  const payments = await database
    .select({
      playerId: playerPayments.playerId,
      amount: playerPayments.amount,
    })
    .from(playerPayments)
    .where(inArray(playerPayments.playerId, ids));

  // Sum payments per player
  const totals = new Map<number, number>();
  for (const p of payments) {
    totals.set(p.playerId, (totals.get(p.playerId) ?? 0) + p.amount);
  }

  // Keep players whose total < their tier threshold
  const result = new Set<number>();
  for (const p of contractPlayers) {
    const threshold = STANDARD_DEPOSIT[p.contractedFrequency] ?? 0;
    const paid = totals.get(p.id) ?? 0;
    if (paid < threshold) result.add(p.id);
  }
  return result;
}
