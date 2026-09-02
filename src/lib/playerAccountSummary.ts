/**
 * Pure compute of per-player accounting figures. Single source of truth
 * shared by:
 *   - the Accounts tab (display)
 *   - the Communications send / preview endpoints (template substitution)
 *
 * Mirrors the formula the Accounts tab uses today:
 *   1x  contract: fee = priceDons1
 *   1x+ contract: fee = priceDons1 + extraGames × priceSubs
 *                 extraGames = locked override OR max(0, scheduledGames − 1 × baseWeeks)
 *   2x  contract: fee = priceDons2
 *   2+  contract: fee = priceDons2 + extraGames × priceExtraHour
 *                 extraGames = locked override OR max(0, scheduledGames − 2 × baseWeeks)
 *   sub:           fee = extraGames × priceSubs
 *                 extraGames = locked override OR scheduledGames
 *
 * Overriding all of the above: a player flagged noCharge is comped —
 * base, extras and fee are all forced to 0, whatever their tier or game
 * count. Their scheduledGames / extraGames still report the real counts
 * so the Accounts tab can show what they played for $0.
 */

export const STANDARD_DEPOSIT: Record<string, number> = {
  "1": 500,
  "1+": 500,
  "2": 750,
  "2+": 750,
  // subs deliberately omitted — no standard deposit
};

export interface AccountInputPlayer {
  id: number;
  firstName: string;
  lastName: string;
  contractedFrequency: string; // "0" | "1" | "2" | "2+"
  isActive: boolean;
  lockedExtraGames: number | null;
  /** Comped player — never billed a season fee or a per-game fee. */
  noCharge?: boolean;
}

export interface AccountInputPayment {
  playerId: number;
  amount: number;
}

export interface AccountInputGameAssignment {
  playerId: number;
  gameStatus: string; // "normal" | "holiday" | …
  gameGroup: string;  // "dons" | "solo"
}

export interface AccountInputRates {
  priceDons1: number;
  priceDons2: number;
  priceExtraHour: number;
  priceSubs: number;
}

export interface AccountSummary {
  playerId: number;
  firstName: string;
  lastName: string;
  /** Raw frequency string from DB ("0" | "1" | "2" | "2+") */
  contractedFrequency: string;
  /** Normalised label for display */
  contractLabel: string;
  scheduledGames: number;
  base: number;
  extraGames: number;
  extras: number;
  fee: number;
  deposits: number;
  balance: number;        // fee − deposits  (positive = owes; negative = credit)
  stdDeposit: number;     // tier's standard deposit ($0 for sub)
  depositDue: number;     // max(0, stdDeposit − deposits)
  locked: boolean;        // extras are frozen by lockedExtraGames
  noCharge: boolean;      // comped — fee forced to $0
}

function contractLabel(freq: string): string {
  switch (freq) {
    case "0":
      return "Sub";
    case "1":
      return "1x";
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

export function computeAccountSummaries(input: {
  players: AccountInputPlayer[];
  payments: AccountInputPayment[];
  donsNormalAssignments: AccountInputGameAssignment[];
  rates: AccountInputRates;
  /** weeks-per-season from BudgetParams (e.g. 36) — NOT season.totalWeeks */
  baseWeeks: number;
}): AccountSummary[] {
  const { players, payments, donsNormalAssignments, rates, baseWeeks } = input;

  // Tally Don's normal-status games per player
  const gamesByPlayer = new Map<number, number>();
  for (const a of donsNormalAssignments) {
    if (a.gameStatus !== "normal") continue;
    if (a.gameGroup !== "dons") continue;
    gamesByPlayer.set(a.playerId, (gamesByPlayer.get(a.playerId) ?? 0) + 1);
  }

  // Sum payments per player
  const depositsByPlayer = new Map<number, number>();
  for (const p of payments) {
    depositsByPlayer.set(
      p.playerId,
      (depositsByPlayer.get(p.playerId) ?? 0) + p.amount
    );
  }

  const out: AccountSummary[] = [];
  for (const p of players) {
    if (!p.isActive) continue;
    const freq = p.contractedFrequency;
    if (!["0", "1", "1+", "2", "2+"].includes(freq)) continue;

    const scheduledGames = gamesByPlayer.get(p.id) ?? 0;
    const locked = p.lockedExtraGames !== null && p.lockedExtraGames !== undefined;

    let base = 0;
    let extraGames = 0;
    let extras = 0;
    if (freq === "1") {
      base = rates.priceDons1;
    } else if (freq === "1+") {
      // 1+ player: 1x base + sub-rate billing for any extra games beyond
      // their 1-game-per-week contract.
      base = rates.priceDons1;
      extraGames = locked
        ? (p.lockedExtraGames as number)
        : Math.max(0, scheduledGames - 1 * baseWeeks);
      extras = extraGames * rates.priceSubs;
    } else if (freq === "2") {
      base = rates.priceDons2;
    } else if (freq === "2+") {
      base = rates.priceDons2;
      extraGames = locked
        ? (p.lockedExtraGames as number)
        : Math.max(0, scheduledGames - 2 * baseWeeks);
      extras = extraGames * rates.priceExtraHour;
    } else if (freq === "0") {
      // Sub
      base = 0;
      extraGames = locked ? (p.lockedExtraGames as number) : scheduledGames;
      extras = extraGames * rates.priceSubs;
      // Skip subs with no scheduled games and no locked override
      if (extraGames === 0) continue;
    }

    // Comped player: zero out both the season/contract fee and the
    // per-game extras. scheduledGames/extraGames keep their real values
    // so the row still shows what the player actually played, at $0.
    const noCharge = p.noCharge === true;
    if (noCharge) {
      base = 0;
      extras = 0;
    }

    const fee = base + extras;
    const deposits = depositsByPlayer.get(p.id) ?? 0;
    // A comped player owes nothing, so the tier's standard deposit
    // doesn't apply to them either.
    const stdDeposit = noCharge ? 0 : (STANDARD_DEPOSIT[freq] ?? 0);
    const depositDue = Math.max(0, stdDeposit - deposits);

    out.push({
      playerId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      contractedFrequency: freq,
      contractLabel: contractLabel(freq),
      scheduledGames,
      base,
      extraGames,
      extras,
      fee,
      deposits,
      balance: fee - deposits,
      stdDeposit,
      depositDue,
      locked,
      noCharge,
    });
  }

  return out;
}
