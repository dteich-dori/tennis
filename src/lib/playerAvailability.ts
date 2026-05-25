/**
 * Helpers for "weekly availability vs contract" reconciliation.
 *
 * A player whose available days equal their contract's basic count has no
 * room for extras. The "+" tiers (1+, 2+) imply ≥ 1 extra game / week, so
 * we auto-downgrade them when availability is too tight:
 *
 *   1+  with ≤ 1 available day  → 1
 *   2+  with ≤ 2 available days → 2
 *
 * Non-+ tiers are never touched.
 */

const TOTAL_DAYS_PER_WEEK = 7;

export function availableDays(blockedDaysCount: number): number {
  return Math.max(0, TOTAL_DAYS_PER_WEEK - blockedDaysCount);
}

/** Basic per-week game count implied by the contract (ignoring "+"). */
export function basicGamesPerWeek(contractedFrequency: string): number {
  if (contractedFrequency === "1" || contractedFrequency === "1+") return 1;
  if (contractedFrequency === "2" || contractedFrequency === "2+") return 2;
  return 0;
}

/**
 * True iff the player CAN realistically be given extras on top of their
 * contract — i.e. has more available days than their basic weekly count.
 */
export function canHaveExtras(
  contractedFrequency: string,
  blockedDaysCount: number
): boolean {
  if (contractedFrequency !== "1+" && contractedFrequency !== "2+") return true;
  return availableDays(blockedDaysCount) > basicGamesPerWeek(contractedFrequency);
}

/**
 * If the player's contract requests extras (1+, 2+) but their availability
 * leaves no room, return the basic-tier equivalent. Otherwise return the
 * input unchanged.
 */
export function downgradeContractIfNeeded(
  contractedFrequency: string,
  blockedDaysCount: number
): string {
  if (contractedFrequency === "1+" && availableDays(blockedDaysCount) <= 1) {
    return "1";
  }
  if (contractedFrequency === "2+" && availableDays(blockedDaysCount) <= 2) {
    return "2";
  }
  return contractedFrequency;
}
