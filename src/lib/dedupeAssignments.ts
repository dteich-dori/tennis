/**
 * One rule, one place: which game_assignments row "counts" for a slot.
 *
 * THE PROBLEM. `game_assignments` currently holds more than one row for some
 * `(game_id, slot_position)` pairs — several games carry eight rows for four
 * slots. See docs/DB-CLEANUP-TODO.md. The data has not been cleaned yet.
 *
 * WHY NOTHING ON SCREEN SHOWED IT. The Schedule grid fills each slot with
 *
 *     game.assignments.find((a) => a.slotPosition === slot)
 *
 * `.find()` takes the first row and never shows the rest. `/api/games` and
 * `/api/public/schedule` both load assignments with no ORDER BY, so SQLite
 * hands them back in rowid order — meaning "first" is the row with the
 * LOWEST id. Any view built on slots therefore shows exactly four players and
 * hides the extras; any code that counts ROWS instead sees inflated numbers.
 *
 * That inflation reached billing: `computeAccountSummaries` bills 1x+, 2x+ and
 * sub players per scheduled game, so every hidden duplicate was a charged game.
 *
 * THE RULE. Keep the lowest-id row per (gameId, slotPosition). That reproduces
 * precisely what the grid displays, so counts agree with what everyone sees on
 * their schedule. Note this is NOT the same as counting distinct
 * (game, slot) pairs: a player who is the SECOND row at a slot is not shown
 * there and must not be counted there either.
 *
 * Sorting by id rather than trusting array order makes the result independent
 * of how the caller happened to fetch the rows.
 *
 * Once the table is cleaned up this becomes a no-op and every call can be
 * dropped along with this file.
 */

export interface SlotOccupant {
  id: number;
  gameId: number;
  slotPosition: number;
}

/**
 * Return only the rows the Schedule grid would actually display: one per
 * (gameId, slotPosition), the one with the lowest id.
 */
export function firstPerSlot<T extends SlotOccupant>(rows: readonly T[]): T[] {
  const winner = new Map<string, T>();
  for (const r of rows) {
    const key = `${r.gameId}:${r.slotPosition}`;
    const current = winner.get(key);
    if (current === undefined || r.id < current.id) winner.set(key, r);
  }
  return [...winner.values()];
}

/**
 * Convenience for the common case: how many displayed slots each player holds.
 * Returns playerId -> count.
 */
export function countPerPlayer<T extends SlotOccupant & { playerId: number }>(
  rows: readonly T[]
): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of firstPerSlot(rows)) {
    out.set(r.playerId, (out.get(r.playerId) ?? 0) + 1);
  }
  return out;
}
