/**
 * Helpers for "weekly availability vs contract" reconciliation.
 *
 * The tennis week length is configured per season (seasons.daysPerWeek).
 *   5 = Mon–Fri (default)
 *   6 = Mon–Sat
 *   7 = Sun–Sat
 *
 * "Available days" = the count of tennis-week days the player does NOT have
 * blocked. A weekend block in a 5-day week does NOT reduce availability —
 * the player wasn't going to play that day anyway.
 *
 * The "+" contract tiers (1+, 2+) imply ≥ 1 extra game / week. When a
 * player's available days equal (or fall below) their contract's basic
 * count, there's no room for extras, so we auto-downgrade on save:
 *
 *   1+  with ≤ 1 available day  → 1
 *   2+  with ≤ 2 available days → 2
 */

/**
 * Day-of-week numbers that count as tennis days. Convention matches
 * JavaScript's Date.getDay(): 0=Sun, 1=Mon, …, 6=Sat.
 */
export function tennisDayNumbers(daysPerWeek: number): number[] {
  const dpw = clampDaysPerWeek(daysPerWeek);
  if (dpw === 7) return [0, 1, 2, 3, 4, 5, 6]; // Sun–Sat
  if (dpw === 6) return [1, 2, 3, 4, 5, 6];    // Mon–Sat
  return [1, 2, 3, 4, 5];                      // Mon–Fri
}

export function clampDaysPerWeek(daysPerWeek: number | null | undefined): 5 | 6 | 7 {
  const n = Number(daysPerWeek);
  if (n === 7) return 7;
  if (n === 6) return 6;
  return 5;
}

/** Days a player can actually be scheduled, given their blocked-day list. */
export function availableDays(
  blockedDays: number[],
  daysPerWeek: number
): number {
  const tennisDays = tennisDayNumbers(daysPerWeek);
  const blockedSet = new Set(blockedDays);
  return tennisDays.filter((d) => !blockedSet.has(d)).length;
}

/** Basic per-week game count implied by the contract (ignoring "+"). */
export function basicGamesPerWeek(contractedFrequency: string): number {
  if (contractedFrequency === "1" || contractedFrequency === "1+") return 1;
  if (contractedFrequency === "2" || contractedFrequency === "2+") return 2;
  return 0;
}

/**
 * True iff the player has more available days than their basic weekly
 * contract count, i.e. has room for extras.
 */
export function canHaveExtras(
  contractedFrequency: string,
  blockedDays: number[],
  daysPerWeek: number
): boolean {
  if (contractedFrequency !== "1+" && contractedFrequency !== "2+") return true;
  return (
    availableDays(blockedDays, daysPerWeek) > basicGamesPerWeek(contractedFrequency)
  );
}

/**
 * If the player's contract requests extras (1+, 2+) but their availability
 * leaves no room, return the basic-tier equivalent. Otherwise return the
 * input unchanged.
 */
export function downgradeContractIfNeeded(
  contractedFrequency: string,
  blockedDays: number[],
  daysPerWeek: number
): string {
  const avail = availableDays(blockedDays, daysPerWeek);
  if (contractedFrequency === "1+" && avail <= 1) return "1";
  if (contractedFrequency === "2+" && avail <= 2) return "2";
  return contractedFrequency;
}
