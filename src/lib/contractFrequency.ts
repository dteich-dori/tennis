/**
 * Helpers for the `players.contractedFrequency` text column.
 *
 * Allowed values:
 *   "0"  — Sub (no contract)
 *   "1"  — 1 game/week
 *   "1L" — 1x limited: 1 game/week, cheaper season fee, and extra games
 *          above the contract are NEVER billed. The weekly game only
 *          materialises when the player is included in auto-assign —
 *          untick that and they get nothing automatically.
 *   "1+" — 1 game/week, also eligible to sub (sub priority over "0")
 *   "2"  — 2 games/week
 *   "2+" — 2 games/week, plus extra games billed at extra-hour rate
 *
 * Note: simple `parseInt("1+")` returns NaN, so always use these helpers
 * when extracting numeric weekly counts.
 */

export type ContractFrequency = "0" | "1" | "1L" | "1+" | "2" | "2+";

export const ALL_CONTRACT_FREQUENCIES: ContractFrequency[] = [
  "0",
  "1",
  "1L",
  "1+",
  "2",
  "2+",
];

/** Number of contracted games per week implied by a frequency string. */
export function weeklyContractedGames(freq: string): number {
  switch (freq) {
    case "1":
    case "1L":
    case "1+":
      return 1;
    case "2":
    case "2+":
      return 2;
    default:
      return 0;
  }
}

/** True if this player is a "contract" player (has a guaranteed weekly game). */
export function isContracted(freq: string): boolean {
  return weeklyContractedGames(freq) > 0;
}

/**
 * True if the player can be picked from the sub pool. Includes pure subs
 * ("0") and 1+ players (who have a contract AND can sub).
 */
export function isSubEligible(freq: string): boolean {
  return freq === "0" || freq === "1+";
}

/**
 * Display label, e.g. "Sub", "1x", "1x+", "2x", "2x+".
 */
export function contractLabel(freq: string): string {
  switch (freq) {
    case "0":
      return "Sub";
    case "1":
      return "1x";
    case "1L":
      return "1x ltd";
    case "1+":
      return "1x+";
    case "2":
      return "2x";
    case "2+":
      return "2x+";
    default:
      return freq;
  }
}
