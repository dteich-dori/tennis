/**
 * Swap suggestions — shared by the admin Re-assign → Swap tab and the
 * read-only /swap-finder page.
 *
 * A swap is: player A gives up game A, partner B takes it, and A takes
 * one of B's games in return. Both directions are validated, because a
 * suggestion that only works one way is not a swap.
 *
 * Only CONTRACT players are offered as partners. A sub taking the game
 * would be billed for it, which is a paid substitution rather than a
 * free swap.
 */

export interface SwapPlayer {
  id: number;
  firstName: string;
  lastName: string;
  isActive: boolean;
  skillLevel: string;
  contractedFrequency: string;
  soloGames: number | null;
  blockedDays: number[];
  vacations: { startDate: string; endDate: string }[];
  doNotPair: number[];
}

export interface SwapGame {
  id: number;
  gameNumber: number;
  date: string;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  weekNumber: number;
  status: string;
  group: string;
  assignments: { playerId: number }[];
}

export interface SwapCandidate {
  playerB: SwapPlayer;
  gameY: SwapGame;
  weekDistance: number;
}

/**
 * Why `pid` cannot play `game`, or null if they can.
 *
 * `excludeGameId` is the slot the player is giving up in the swap — it
 * must be ignored, or their own current game reads as a clash.
 */
export function whyCannotPlay(
  pid: number,
  game: SwapGame,
  players: SwapPlayer[],
  games: SwapGame[],
  excludeGameId?: number
): string | null {
  const playerById = new Map(players.map((p) => [p.id, p]));
  const p = playerById.get(pid);
  if (!p) return "Unknown player";
  if (!p.isActive) return "Inactive";

  for (const v of p.vacations ?? []) {
    if (game.date >= v.startDate && game.date <= v.endDate) {
      return `Vacation ${v.startDate}–${v.endDate}`;
    }
  }
  if ((p.blockedDays ?? []).includes(game.dayOfWeek)) {
    return `Blocked on ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][game.dayOfWeek]}`;
  }
  if (game.group === "solo" && (!p.soloGames || p.soloGames <= 0)) {
    return "Not a Solo player";
  }
  for (const g of games) {
    if (g.id === game.id) continue;
    if (excludeGameId !== undefined && g.id === excludeGameId) continue;
    if (g.date !== game.date) continue;
    if ((g.assignments ?? []).some((a) => a.playerId === pid)) {
      return `Already in game #${g.gameNumber} that day`;
    }
  }
  for (const a of game.assignments ?? []) {
    if (a.playerId === pid) continue;
    if ((p.doNotPair ?? []).includes(a.playerId)) return "Do-not-pair conflict";
    const other = playerById.get(a.playerId);
    if (other && (other.doNotPair ?? []).includes(pid)) return "Do-not-pair conflict";
  }
  return null;
}

export interface FindSwapOptions<P extends SwapPlayer, G extends SwapGame> {
  players: P[];
  games: G[];
  playerAId: number;
  gameAId: number;
  totalWeeks: number;
  /** Search window either side of the game being given up. */
  weeksBack: number;
  weeksAhead: number;
  /** Cap on games offered per partner — keeps one player off the whole list. */
  maxGamesPerPartner?: number;
}

//  Generic over the caller's own player/game types: the admin page has
//  richer shapes than SwapPlayer/SwapGame and needs them back intact.
export function findSwapSuggestions<P extends SwapPlayer, G extends SwapGame>(
  opts: FindSwapOptions<P, G>
): { playerB: P; gameY: G; weekDistance: number }[] {
  const {
    players, games, playerAId, gameAId, totalWeeks,
    weeksBack, weeksAhead, maxGamesPerPartner = 2,
  } = opts;

  const playerById = new Map(players.map((p) => [p.id, p]));
  const playerA = playerById.get(playerAId);
  const gameA = games.find((g) => g.id === gameAId);
  if (!playerA || !gameA) return [];

  const skill = playerA.skillLevel || "";
  //  Window sits around the game being given up, not around today: a
  //  game entered by number can be anywhere in the season.
  const lo = Math.max(1, gameA.weekNumber - weeksBack);
  const hi = Math.min(totalWeeks, gameA.weekNumber + weeksAhead);

  const found: { playerB: P; gameY: G; weekDistance: number }[] = [];
  for (const g of games) {
    if (g.id === gameA.id) continue;
    if (g.status !== "normal") continue;
    if (g.weekNumber < lo || g.weekNumber > hi) continue;
    if (g.group !== gameA.group) continue;
    if (g.date === gameA.date) continue; // same-date clash for whoever moves
    for (const a of g.assignments ?? []) {
      if (a.playerId === playerA.id) continue;
      const pB = playerById.get(a.playerId);
      if (!pB || !pB.isActive) continue;
      if (pB.contractedFrequency === "0") continue; // subs are paid, not swapped
      if ((pB.skillLevel || "") !== skill) continue;
      if (whyCannotPlay(playerA.id, g, players, games, gameA.id)) continue;
      if (whyCannotPlay(pB.id, gameA, players, games, g.id)) continue;
      found.push({
        playerB: pB,
        gameY: g,
        weekDistance: Math.abs(g.weekNumber - gameA.weekNumber),
      });
    }
  }

  // Each partner's soonest games only.
  const byPlayer = new Map<number, { playerB: P; gameY: G; weekDistance: number }[]>();
  for (const c of found) {
    const arr = byPlayer.get(c.playerB.id) ?? [];
    arr.push(c);
    byPlayer.set(c.playerB.id, arr);
  }
  const trimmed: { playerB: P; gameY: G; weekDistance: number }[] = [];
  const bestDistance = new Map<number, number>();
  for (const [pid, arr] of byPlayer) {
    arr.sort((x, y) => x.gameY.date.localeCompare(y.gameY.date));
    bestDistance.set(pid, Math.min(...arr.map((c) => c.weekDistance)));
    trimmed.push(...arr.slice(0, maxGamesPerPartner));
  }

  // Nearest partner first, each partner's rows kept together.
  trimmed.sort((x, y) => {
    if (x.playerB.id === y.playerB.id) return x.gameY.date.localeCompare(y.gameY.date);
    const d = (bestDistance.get(x.playerB.id) ?? 0) - (bestDistance.get(y.playerB.id) ?? 0);
    if (d !== 0) return d;
    return x.playerB.lastName.localeCompare(y.playerB.lastName);
  });
  return trimmed;
}
