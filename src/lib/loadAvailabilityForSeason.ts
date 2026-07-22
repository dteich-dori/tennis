import { db } from "@/db/getDb";
import { players, playerBlockedDays, playerVacations, seasons } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { AvailabilityData } from "./templateSubstitute";

/**
 * Bulk-load per-player availability data (blocked days + vacation dates)
 * for every active player in a season. Used by the Communications send
 * route to resolve `{blockedDays}` and `{vacations}` template variables.
 *
 * Structured to mirror loadAccountSummariesForSeason — returns a Map keyed
 * by playerId so the send route can look up per-recipient values without
 * re-querying.
 */
export async function loadAvailabilityForSeason(
  seasonId: number
): Promise<Map<number, AvailabilityData>> {
  const database = await db();
  const [season] = await database.select().from(seasons).where(eq(seasons.id, seasonId));
  const daysPerWeek = season?.daysPerWeek ?? 5;

  const playerRows = await database
    .select({ id: players.id })
    .from(players)
    .where(eq(players.seasonId, seasonId));
  const playerIds = playerRows.map((p) => p.id);
  const out = new Map<number, AvailabilityData>();
  if (playerIds.length === 0) return out;

  const [blockedRows, vacationRows] = await Promise.all([
    database.select().from(playerBlockedDays).where(inArray(playerBlockedDays.playerId, playerIds)),
    database.select().from(playerVacations).where(inArray(playerVacations.playerId, playerIds)),
  ]);

  const blockedByPlayer = new Map<number, number[]>();
  for (const b of blockedRows) {
    const arr = blockedByPlayer.get(b.playerId) ?? [];
    arr.push(b.dayOfWeek);
    blockedByPlayer.set(b.playerId, arr);
  }
  // Dedupe vacations by (startDate, endDate) so accidental duplicate
  // rows in player_vacations don't appear as repeated bullets in the
  // {vacations} template output. See v1.196 note.
  const vacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
  const seenPerPlayer = new Map<number, Set<string>>();
  for (const v of vacationRows) {
    const seen = seenPerPlayer.get(v.playerId) ?? new Set<string>();
    const key = `${v.startDate}|${v.endDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    seenPerPlayer.set(v.playerId, seen);
    const arr = vacsByPlayer.get(v.playerId) ?? [];
    arr.push({ startDate: v.startDate, endDate: v.endDate });
    vacsByPlayer.set(v.playerId, arr);
  }

  for (const p of playerRows) {
    out.set(p.id, {
      blockedDays: blockedByPlayer.get(p.id) ?? [],
      vacations: vacsByPlayer.get(p.id) ?? [],
      daysPerWeek,
    });
  }
  return out;
}
