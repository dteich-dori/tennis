/**
 * Pairing Balance Optimizer
 *
 * Swaps same-level players between same-day games to even out how often
 * each pair of players shares a game.
 *
 * Key constraints:
 * - Only swaps players of the SAME skill level (A↔A, B↔B, C↔C)
 * - Never introduces a DNP (do-not-pair) violation
 * - Preserves every player's total game count (just moves them between courts on the same day)
 * - Preserves slot positions (only swaps playerIds on the assignment rows)
 */

export interface AssignmentData {
  id: number;
  gameId: number;
  playerId: number;
  slotPosition: number;
}

export interface GameData {
  id: number;
  weekNumber: number;
  date: string;
  dayOfWeek: number;
  status: string;
  assignments: AssignmentData[];
}

export interface PlayerData {
  id: number;
  skillLevel: string;
  isDerated: boolean;
}

export interface DnpPair {
  playerId: number;
  pairedPlayerId: number;
}

export interface BalanceResult {
  swaps: number;
  imbalanceBefore: number;
  imbalanceAfter: number;
  /** Assignment-level mutations: { assignmentId, newPlayerId } */
  mutations: { assignmentId: number; newPlayerId: number }[];
}

// ---------------------------------------------------------------
// Pairing count helpers
// ---------------------------------------------------------------

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Build a map of pair → count from all game assignments */
function buildPairCounts(gamesById: Map<number, AssignmentData[]>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const assigns of gamesById.values()) {
    const pids = assigns.map((a) => a.playerId);
    for (let i = 0; i < pids.length; i++) {
      for (let j = i + 1; j < pids.length; j++) {
        const k = pairKey(pids[i], pids[j]);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
  }
  return counts;
}

// ---------------------------------------------------------------
// Target computation
// ---------------------------------------------------------------

/**
 * For each same-level pair (i,j), compute an ideal pairing count.
 *
 * We use the actual same-level pairings from the current schedule to compute
 * targets empirically. For each player, we count their total same-level
 * pairings (summing up how many times they share a game with any same-level
 * partner). The target for a specific pair is then:
 *   T(i,j) = avg( totalSameLevelPairings_i / eligiblePartners_i,
 *                  totalSameLevelPairings_j / eligiblePartners_j )
 *
 * This approach uses the actual game composition (mixed vs pure games) rather
 * than a theoretical formula, giving much more accurate targets.
 */
function buildPairTargets(
  playerMap: Map<number, PlayerData>,
  sameLevelPairCounts: Map<string, number>,
  dnpSet: Set<string>
): Map<string, number> {
  const targets = new Map<string, number>();

  // Group players by skill level
  const byLevel = new Map<string, number[]>();
  for (const [pid, p] of playerMap) {
    const arr = byLevel.get(p.skillLevel) ?? [];
    arr.push(pid);
    byLevel.set(p.skillLevel, arr);
  }

  for (const [, levelPlayers] of byLevel) {
    // Count total same-level pairings per player
    const totalSameLevelPairings = new Map<number, number>();
    // Count eligible (non-DNP) partners per player
    const eligibleCount = new Map<number, number>();

    for (const pid of levelPlayers) {
      let pairTotal = 0;
      let eligible = 0;
      for (const other of levelPlayers) {
        if (other === pid) continue;
        if (dnpSet.has(pairKey(pid, other))) continue;
        eligible++;
        pairTotal += sameLevelPairCounts.get(pairKey(pid, other)) ?? 0;
      }
      totalSameLevelPairings.set(pid, pairTotal);
      eligibleCount.set(pid, Math.max(eligible, 1));
    }

    // Compute target for each pair
    for (let i = 0; i < levelPlayers.length; i++) {
      for (let j = i + 1; j < levelPlayers.length; j++) {
        const p1 = levelPlayers[i];
        const p2 = levelPlayers[j];
        const k = pairKey(p1, p2);

        if (dnpSet.has(k)) {
          targets.set(k, 0);
          continue;
        }

        // Ideal: each player's total same-level pairings spread evenly
        const t1 = totalSameLevelPairings.get(p1)! / eligibleCount.get(p1)!;
        const t2 = totalSameLevelPairings.get(p2)! / eligibleCount.get(p2)!;
        const target = (t1 + t2) / 2;

        targets.set(k, target);
      }
    }
  }

  return targets;
}

// ---------------------------------------------------------------
// Imbalance computation
// ---------------------------------------------------------------

function computeImbalance(
  pairCounts: Map<string, number>,
  pairTargets: Map<string, number>
): number {
  let total = 0;
  // Sum over all target pairs
  for (const [k, target] of pairTargets) {
    const actual = pairCounts.get(k) ?? 0;
    total += (actual - target) ** 2; // squared error for stronger gradient
  }
  return total;
}

// ---------------------------------------------------------------
// DNP validation
// ---------------------------------------------------------------

function hasDnpViolation(
  playerIds: number[],
  dnpSet: Set<string>
): boolean {
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      if (dnpSet.has(pairKey(playerIds[i], playerIds[j]))) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------
// Main optimizer
// ---------------------------------------------------------------

export function optimizePairings(
  allGames: GameData[],
  playerMap: Map<number, PlayerData>,
  dnpPairs: DnpPair[],
  maxDeratedPerWeek: number | null
): BalanceResult {
  // Build DNP set
  const dnpSet = new Set<string>();
  for (const d of dnpPairs) {
    dnpSet.add(pairKey(d.playerId, d.pairedPlayerId));
  }

  // Only consider normal games with exactly 4 players
  const validGames = allGames.filter(
    (g) => g.status === "normal" && g.assignments.length === 4
  );

  if (validGames.length === 0) {
    return { swaps: 0, imbalanceBefore: 0, imbalanceAfter: 0, mutations: [] };
  }

  // Build mutable in-memory assignment state: gameId → [{ assignmentId, playerId, slotPosition }]
  const gameAssignState = new Map<
    number,
    { assignmentId: number; playerId: number; slotPosition: number }[]
  >();
  for (const g of validGames) {
    gameAssignState.set(
      g.id,
      g.assignments.map((a) => ({
        assignmentId: a.id,
        playerId: a.playerId,
        slotPosition: a.slotPosition,
      }))
    );
  }

  // Build initial pair counts (ALL pairs, including cross-level)
  const currentAssignMap = new Map<number, AssignmentData[]>();
  for (const [gid, assigns] of gameAssignState) {
    currentAssignMap.set(
      gid,
      assigns.map((a) => ({
        id: a.assignmentId,
        gameId: gid,
        playerId: a.playerId,
        slotPosition: a.slotPosition,
      }))
    );
  }
  const allPairCounts = buildPairCounts(currentAssignMap);

  // Extract same-level pair counts for target computation
  const sameLevelPairCounts = new Map<string, number>();
  for (const [k, count] of allPairCounts) {
    const [id1Str, id2Str] = k.split("-");
    const p1 = playerMap.get(Number(id1Str));
    const p2 = playerMap.get(Number(id2Str));
    if (p1 && p2 && p1.skillLevel === p2.skillLevel) {
      sameLevelPairCounts.set(k, count);
    }
  }

  // Compute pairing targets based on actual same-level pair distribution
  const pairTargets = buildPairTargets(playerMap, sameLevelPairCounts, dnpSet);

  // Use same-level pair counts as our working pair counts for optimization
  let pairCounts = sameLevelPairCounts;
  const imbalanceBefore = computeImbalance(pairCounts, pairTargets);

  // Group games by date for same-day swaps
  const gamesByDate = new Map<string, number[]>();
  for (const g of validGames) {
    const arr = gamesByDate.get(g.date) ?? [];
    arr.push(g.id);
    gamesByDate.set(g.date, arr);
  }

  // Build a derated lookup for players
  const isDeratedMap = new Map<number, boolean>();
  for (const [pid, p] of playerMap) {
    isDeratedMap.set(pid, p.isDerated);
  }

  // Build game-to-week lookup
  const gameWeekMap = new Map<number, number>();
  for (const g of validGames) {
    gameWeekMap.set(g.id, g.weekNumber);
  }

  // Helper: check derated pairing constraint for a proposed game roster
  // If maxDeratedPerWeek is set, a derated+non-derated pair can only appear once per week
  // (or once per 2 weeks if maxDeratedPerWeek === 2)
  function checkDeratedConstraint(
    proposedGameId: number,
    proposedRoster: number[]
  ): boolean {
    if (maxDeratedPerWeek == null) return true; // no limit

    const week = gameWeekMap.get(proposedGameId)!;
    const weeksToCheck =
      maxDeratedPerWeek === 2 ? [week - 1, week] : [week];

    // Find all derated+non-derated pairs in the proposed roster
    const deratedPairs: [number, number][] = [];
    for (let i = 0; i < proposedRoster.length; i++) {
      for (let j = i + 1; j < proposedRoster.length; j++) {
        const p1 = proposedRoster[i];
        const p2 = proposedRoster[j];
        const d1 = isDeratedMap.get(p1) ?? false;
        const d2 = isDeratedMap.get(p2) ?? false;
        if (d1 !== d2) {
          // One is derated, the other is not
          deratedPairs.push([p1, p2]);
        }
      }
    }

    if (deratedPairs.length === 0) return true;

    // Check if any of these derated pairs appear in another game in the same week(s)
    for (const [dp1, dp2] of deratedPairs) {
      for (const g of validGames) {
        if (g.id === proposedGameId) continue;
        const gWeek = gameWeekMap.get(g.id)!;
        if (!weeksToCheck.includes(gWeek)) continue;

        const roster = gameAssignState.get(g.id)!;
        const hasP1 = roster.some((a) => a.playerId === dp1);
        const hasP2 = roster.some((a) => a.playerId === dp2);
        if (hasP1 && hasP2) return false;
      }
    }

    return true;
  }

  // Helper: compute the change in imbalance if we swap player A in game1 with player B in game2
  function computeSwapDelta(
    game1Id: number,
    playerA: number,
    game2Id: number,
    playerB: number
  ): number {
    const roster1 = gameAssignState.get(game1Id)!.map((a) => a.playerId);
    const roster2 = gameAssignState.get(game2Id)!.map((a) => a.playerId);

    // Partners of playerA in game1 (before swap)
    const partners1Before = roster1.filter((p) => p !== playerA);
    // Partners of playerB in game2 (before swap)
    const partners2Before = roster2.filter((p) => p !== playerB);

    // After swap:
    // game1: playerB replaces playerA → partners are the same minus playerA plus playerB
    const roster1After = roster1.map((p) => (p === playerA ? playerB : p));
    const partners1After = roster1After.filter((p) => p !== playerB);
    // game2: playerA replaces playerB → partners are the same minus playerB plus playerA
    const roster2After = roster2.map((p) => (p === playerB ? playerA : p));
    const partners2After = roster2After.filter((p) => p !== playerA);

    let delta = 0;

    // For each affected pair, compute change in squared error
    // Affected pairs: playerA's old partners, playerA's new partners,
    //                 playerB's old partners, playerB's new partners,
    //                 and the cross-pairs between new members and existing roster

    // Collect all affected pair keys and their count changes
    const countChanges = new Map<string, number>();

    // PlayerA leaves game1: loses pairing with each partner in game1
    for (const p of partners1Before) {
      const k = pairKey(playerA, p);
      countChanges.set(k, (countChanges.get(k) ?? 0) - 1);
    }
    // PlayerB joins game1: gains pairing with each partner in game1 (after swap)
    for (const p of partners1After) {
      const k = pairKey(playerB, p);
      countChanges.set(k, (countChanges.get(k) ?? 0) + 1);
    }
    // PlayerB leaves game2: loses pairing with each partner in game2
    for (const p of partners2Before) {
      const k = pairKey(playerB, p);
      countChanges.set(k, (countChanges.get(k) ?? 0) - 1);
    }
    // PlayerA joins game2: gains pairing with each partner in game2 (after swap)
    for (const p of partners2After) {
      const k = pairKey(playerA, p);
      countChanges.set(k, (countChanges.get(k) ?? 0) + 1);
    }

    // Compute delta in squared error for each affected pair
    for (const [k, change] of countChanges) {
      if (change === 0) continue;
      const target = pairTargets.get(k);
      if (target === undefined) continue; // cross-level pair, not tracked
      const oldCount = pairCounts.get(k) ?? 0;
      const newCount = oldCount + change;
      const oldError = (oldCount - target) ** 2;
      const newError = (newCount - target) ** 2;
      delta += newError - oldError;
    }

    return delta;
  }

  // ---------------------------------------------------------------
  // Iterative global-best-swap optimization
  // ---------------------------------------------------------------
  // Each iteration finds the single best swap across ALL dates/games,
  // executes it, then repeats. This avoids greedy conflicts within a pass.
  const MAX_ITERATIONS = 500;
  let totalSwaps = 0;
  let consecutiveNoImprove = 0;

  // Helper to check if two players are same level
  const isSameLevel = (p1: number, p2: number): boolean => {
    const pl1 = playerMap.get(p1);
    const pl2 = playerMap.get(p2);
    return !!pl1 && !!pl2 && pl1.skillLevel === pl2.skillLevel;
  };

  // Helper: execute a swap and update pair counts
  function executeSwap(g1Id: number, playerA: number, g2Id: number, playerB: number) {
    const r1 = gameAssignState.get(g1Id)!;
    const r2 = gameAssignState.get(g2Id)!;

    // Remove old same-level pairings
    for (const x of r1) {
      if (x.playerId === playerA) continue;
      if (isSameLevel(playerA, x.playerId)) {
        const k = pairKey(playerA, x.playerId);
        pairCounts.set(k, (pairCounts.get(k) ?? 0) - 1);
      }
    }
    for (const x of r2) {
      if (x.playerId === playerB) continue;
      if (isSameLevel(playerB, x.playerId)) {
        const k = pairKey(playerB, x.playerId);
        pairCounts.set(k, (pairCounts.get(k) ?? 0) - 1);
      }
    }

    // Swap playerIds
    const assignA = r1.find((x) => x.playerId === playerA)!;
    const assignB = r2.find((x) => x.playerId === playerB)!;
    assignA.playerId = playerB;
    assignB.playerId = playerA;

    // Add new same-level pairings
    for (const x of r1) {
      if (x.playerId === playerB) continue;
      if (isSameLevel(playerB, x.playerId)) {
        const k = pairKey(playerB, x.playerId);
        pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
      }
    }
    for (const x of r2) {
      if (x.playerId === playerA) continue;
      if (isSameLevel(playerA, x.playerId)) {
        const k = pairKey(playerA, x.playerId);
        pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
      }
    }
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Find the single best swap across ALL date/game pairs
    let globalBestDelta = -0.001;
    let globalBest: { g1: number; a: number; g2: number; b: number } | null = null;

    for (const [, dateGameIds] of gamesByDate) {
      if (dateGameIds.length < 2) continue;

      for (let gi = 0; gi < dateGameIds.length; gi++) {
        for (let gj = gi + 1; gj < dateGameIds.length; gj++) {
          const g1Id = dateGameIds[gi];
          const g2Id = dateGameIds[gj];
          const roster1 = gameAssignState.get(g1Id)!;
          const roster2 = gameAssignState.get(g2Id)!;

          for (const a1 of roster1) {
            for (const a2 of roster2) {
              const p1 = playerMap.get(a1.playerId);
              const p2 = playerMap.get(a2.playerId);
              if (!p1 || !p2) continue;
              if (p1.skillLevel !== p2.skillLevel) continue;
              if (a1.playerId === a2.playerId) continue;
              if (roster2.some((a) => a.playerId === a1.playerId)) continue;
              if (roster1.some((a) => a.playerId === a2.playerId)) continue;

              // DNP check
              const newRoster1 = roster1.map((a) =>
                a.playerId === a1.playerId ? a2.playerId : a.playerId
              );
              const newRoster2 = roster2.map((a) =>
                a.playerId === a2.playerId ? a1.playerId : a.playerId
              );
              if (hasDnpViolation(newRoster1, dnpSet)) continue;
              if (hasDnpViolation(newRoster2, dnpSet)) continue;

              // Derated check — only needed if the swap introduces new
              // derated+non-derated pairings (skip if both swapped players
              // have the same derated status, since it won't change anything)
              if (maxDeratedPerWeek != null && p1.isDerated !== p2.isDerated) {
                if (!checkDeratedConstraint(g1Id, newRoster1)) continue;
                if (!checkDeratedConstraint(g2Id, newRoster2)) continue;
              }

              const delta = computeSwapDelta(g1Id, a1.playerId, g2Id, a2.playerId);
              if (delta < globalBestDelta) {
                globalBestDelta = delta;
                globalBest = { g1: g1Id, a: a1.playerId, g2: g2Id, b: a2.playerId };
              }
            }
          }
        }
      }
    }

    if (!globalBest) {
      consecutiveNoImprove++;
      if (consecutiveNoImprove >= 2) break;
      continue;
    }

    // Execute the globally best swap
    executeSwap(globalBest.g1, globalBest.a, globalBest.g2, globalBest.b);
    totalSwaps++;
    consecutiveNoImprove = 0;
  }


  const imbalanceAfter = computeImbalance(pairCounts, pairTargets);

  // Build mutations: compare final state to original assignments
  const mutations: { assignmentId: number; newPlayerId: number }[] = [];
  for (const g of validGames) {
    const finalAssigns = gameAssignState.get(g.id)!;
    for (const fa of finalAssigns) {
      const original = g.assignments.find((a) => a.id === fa.assignmentId)!;
      if (original.playerId !== fa.playerId) {
        mutations.push({
          assignmentId: fa.assignmentId,
          newPlayerId: fa.playerId,
        });
      }
    }
  }

  return {
    swaps: totalSwaps,
    imbalanceBefore,
    imbalanceAfter,
    mutations,
  };
}
