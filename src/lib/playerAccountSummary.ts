/**
 * Pure compute of per-player accounting figures. Single source of truth
 * shared by:
 *   - the Accounts tab (display)
 *   - the Communications send / preview endpoints (template substitution)
 *
 * Mirrors the formula the Accounts tab uses today:
 *   1x  contract: fee = priceDons1
 *   1x limited:   fee = priceDons1Limited, flat — extra games are never
 *                 billed for this tier, however many are scheduled
 *   1x+ contract: fee = priceDons1 + extraGames × priceSubs
 *                 extraGames = max(0, scheduledGames − 1 × baseWeeks)
 *   2x  contract: fee = priceDons2
 *   2+  contract: fee = priceDons2 + extraGames × priceExtraHour
 *                 extraGames = max(0, scheduledGames − 2 × baseWeeks)
 *   sub:           fee = extraGames × priceSubs
 *                 extraGames = scheduledGames
 *
 * Balance = fee − deposits − credit, where credit is the player's
 * carry-over from the previous year's distribution.
 *
 * Solo is billed independently of the Don's contract:
 *   soloFee     = soloGames × priceSolo
 *   soloBalance = soloFee − soloDeposit − soloCredit
 * soloDeposit and soloCredit are their own buckets, NOT the Don's
 * payment ledger or priorYearCredit.
 *
 * Overriding all of the above: a player flagged noCharge is comped —
 * base, extras and fee are all forced to 0, whatever their tier or game
 * count. Their scheduledGames / extraGames still report the real counts
 * so the Accounts tab can show what they played for $0.
 */

import { contractLabel } from "./contractFrequency";

export const STANDARD_DEPOSIT: Record<string, number> = {
  "1": 500,
  "1+": 500,
  // "1L" deliberately absent — 1x limited carries no standard deposit.
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
  /** Comped player — never billed a season fee or a per-game fee. */
  noCharge?: boolean;
  /** Credit from the previous year's distribution — reduces the Don's balance. */
  priorYearCredit?: number;
  /** Contracted solo games for the season (null = not in the solo group). */
  soloGames?: number | null;
  /** Deposits against the SOLO fee — separate from the Don's ledger. */
  soloDeposit?: number;
  /** Credit against the SOLO fee — the solo counterpart to priorYearCredit. */
  soloCredit?: number;
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
  /** Season fee for the "1x limited" tier. */
  priceDons1Limited?: number;
  /** Per-game solo rate. Absent → solo figures compute as 0. */
  priceSolo?: number;
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
  credit: number;         // prior-year distribution credit
  balance: number;        // fee − deposits − credit  (positive = owes; negative = credit)
  soloGames: number;      // contracted solo games (0 = not in the solo group)
  soloFee: number;        // soloGames × priceSolo
  soloDeposit: number;    // deposits against the solo fee
  soloCredit: number;     // credit against the solo fee
  soloBalance: number;    // soloFee − soloDeposit − soloCredit
  stdDeposit: number;     // tier's standard deposit ($0 for sub)
  depositDue: number;     // max(0, stdDeposit − deposits)
  noCharge: boolean;      // comped — fee forced to $0
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
    if (!["0", "1", "1L", "1+", "2", "2+"].includes(freq)) continue;

    const scheduledGames = gamesByPlayer.get(p.id) ?? 0;

    let base = 0;
    let extraGames = 0;
    let extras = 0;
    if (freq === "1") {
      base = rates.priceDons1;
    } else if (freq === "1L") {
      //  1x limited: flat season fee, and extras are never charged —
      //  extraGames stays 0 so nothing downstream bills them.
      base = rates.priceDons1Limited ?? 0;
    } else if (freq === "1+") {
      // 1+ player: 1x base + sub-rate billing for any extra games beyond
      // their 1-game-per-week contract.
      base = rates.priceDons1;
      extraGames = Math.max(0, scheduledGames - 1 * baseWeeks);
      extras = extraGames * rates.priceSubs;
    } else if (freq === "2") {
      base = rates.priceDons2;
    } else if (freq === "2+") {
      base = rates.priceDons2;
      extraGames = Math.max(0, scheduledGames - 2 * baseWeeks);
      extras = extraGames * rates.priceExtraHour;
    } else if (freq === "0") {
      // Sub
      base = 0;
      extraGames = scheduledGames;
      extras = extraGames * rates.priceSubs;
      // Skip subs with no scheduled games — nothing to bill
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

    // Credit carried over from last year's distribution. Reduces what the
    // player owes, on top of anything they've already paid in.
    const credit = noCharge ? 0 : (p.priorYearCredit ?? 0);

    // Solo is billed separately from the Don's contract: contracted solo
    // games × the per-game solo rate, against its own deposit bucket.
    const soloGames = p.soloGames ?? 0;
    const soloFee = noCharge ? 0 : soloGames * (rates.priceSolo ?? 0);
    const soloDeposit = p.soloDeposit ?? 0;
    const soloCredit = noCharge ? 0 : (p.soloCredit ?? 0);

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
      credit,
      balance: fee - deposits - credit,
      soloGames,
      soloFee,
      soloDeposit,
      soloCredit,
      soloBalance: soloFee - soloDeposit - soloCredit,
      stdDeposit,
      depositDue,
      noCharge,
    });
  }

  return out;
}
