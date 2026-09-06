/**
 * Recipient-group filtering for Communications.
 *
 * Single source of truth, used by BOTH the recipients preview endpoint
 * and the send endpoint. These two used to carry their own copies of
 * the same if/else chain, which meant a group added to one but not the
 * other previewed one audience and mailed a different one.
 *
 * The Don's and Solo groups deliberately OVERLAP: every solo player
 * also holds a Don's contract and still owes Don's fees, so a Don's
 * message has to reach them as well.
 */

/** Contract tiers that constitute a Don's contract (subs included). */
const DONS_CONTRACTS = ["0", "1", "1L", "1+", "2", "2+"];

export interface GroupFilterablePlayer {
  id: number;
  contractedFrequency: string;
  soloGames: number | null;
  /** Scratch flag for the ad-hoc "Flagged" group. */
  flagged?: boolean;
}

/**
 * Narrow `players` to the given recipient group.
 *
 * @param owingIds  Player ids below their standard deposit. Required for
 *                  the "Owes Deposit" group (it needs a DB lookup the
 *                  caller performs); ignored otherwise.
 *
 * Groups not listed here ("ALL", "Players", "Test") apply no filter —
 * their audience is decided by the caller.
 */
export function filterByRecipientGroup<T extends GroupFilterablePlayer>(
  players: T[],
  group: string,
  owingIds?: Set<number>
): T[] {
  switch (group) {
    case "Don's Group":
      return players.filter((p) => DONS_CONTRACTS.includes(p.contractedFrequency));
    case "Solo Group":
      return players.filter((p) => p.soloGames != null && p.soloGames > 0);
    case "Flagged":
      //  Ad-hoc group built by ticking Flag on the Players list. Cuts
      //  across contract tiers by design.
      return players.filter((p) => p.flagged === true);
    case "Not Flagged":
      //  The inverse, and usually the more useful direction: tick people
      //  off as they respond, then send to everyone still unticked.
      return players.filter((p) => p.flagged !== true);
    case "Contract Players":
      return players.filter((p) => p.contractedFrequency !== "0");
    case "Subs":
      return players.filter((p) => p.contractedFrequency === "0");
    case "Owes Deposit":
      return owingIds ? players.filter((p) => owingIds.has(p.id)) : players;
    default:
      return players;
  }
}
