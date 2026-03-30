import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerBlockedDays, playerVacations, playerDoNotPair, playerGroupMembers } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// Types
interface PlayerData {
  id: number;
  firstName: string;
  lastName: string;
  contractedFrequency: string;
  skillLevel: string;
  isDerated: boolean;
  noConsecutiveDays: boolean;
  noEarlyGames: boolean;
  cGamesOk: boolean;
  soloGames: number | null;
  groupPct: number;
  groupMembers: number[];
  blockedDays: number[];
  vacations: { startDate: string; endDate: string }[];
  doNotPair: number[];
}

interface GameData {
  id: number;
  gameNumber: number;
  seasonId: number;
  weekNumber: number;
  date: string;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  group: string;
  status: string;
  assignments: { id: number; gameId: number; playerId: number; slotPosition: number }[];
}

interface LogEntry {
  type: "info" | "warning" | "error";
  day?: string;
  message: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * POST /api/games/auto-assign
 * Body: { seasonId: number, weekNumber: number }
 * Auto-assigns all empty Don's game slots for the given week.
 */
export async function POST(request: NextRequest) {
  try {
    const { seasonId, weekNumber, assignExtra, assignCSubs, assignStdCatchup } = (await request.json()) as {
      seasonId: number;
      weekNumber: number;
      assignExtra?: boolean;
      assignCSubs?: boolean;
      assignStdCatchup?: boolean;
    };

    if (!seasonId || !weekNumber) {
      return NextResponse.json({ error: "seasonId and weekNumber required" }, { status: 400 });
    }

    const database = await db();
    const log: LogEntry[] = [];

    // 1. Load all games for this week
    const weekGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.weekNumber, weekNumber)));

    // Load assignments for these games
    const gameIds = weekGames.map((g) => g.id);
    let allAssignments: { id: number; gameId: number; playerId: number; slotPosition: number }[] = [];
    const BATCH = 50;
    for (let i = 0; i < gameIds.length; i += BATCH) {
      const batch = gameIds.slice(i, i + BATCH);
      const rows = await database.select().from(gameAssignments).where(inArray(gameAssignments.gameId, batch));
      allAssignments.push(...rows);
    }

    // Build game objects with assignments
    const assignmentsByGame = new Map<number, typeof allAssignments>();
    for (const a of allAssignments) {
      const arr = assignmentsByGame.get(a.gameId) ?? [];
      arr.push(a);
      assignmentsByGame.set(a.gameId, arr);
    }

    const gamesWithAssignments: GameData[] = weekGames.map((g) => ({
      ...g,
      assignments: (assignmentsByGame.get(g.id) ?? []).sort((a, b) => a.slotPosition - b.slotPosition),
    }));

    // Sort: day → time → court
    gamesWithAssignments.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.courtNumber - b.courtNumber;
    });

    const donsGames = gamesWithAssignments.filter((g) => g.group === "dons" && g.status === "normal");
    const soloGames = gamesWithAssignments.filter((g) => g.group === "solo" && g.status === "normal");

    // 2. Validate: partially-assigned Solo games must be completed first
    // Solo games with 0 assignments are OK (Solo doesn't need this week) — only block
    // if some slots are filled but not all 4 (partially assigned).
    const partialSolo = soloGames.filter((g) => g.assignments.length > 0 && g.assignments.length < 4);
    if (partialSolo.length > 0) {
      return NextResponse.json({
        error: `Some Solo games are partially assigned. Complete them first. ${partialSolo.length} Solo game(s) still have open slots.`,
        log: [{ type: "error", message: `${partialSolo.length} Solo game(s) partially assigned: games #${partialSolo.map((g) => g.gameNumber).join(", #")}` }],
      }, { status: 400 });
    }

    // 4. Load all active players with constraints
    const allPlayers = await database.select().from(players).where(and(eq(players.seasonId, seasonId), eq(players.isActive, true)));
    const playerIds = allPlayers.map((p) => p.id);

    let blockedDaysRows: { playerId: number; dayOfWeek: number }[] = [];
    let vacationRows: { playerId: number; startDate: string; endDate: string }[] = [];
    let dnpRows: { playerId: number; pairedPlayerId: number }[] = [];
    let groupMemberRows: { playerId: number; memberId: number }[] = [];

    if (playerIds.length > 0) {
      blockedDaysRows = await database.select().from(playerBlockedDays).where(inArray(playerBlockedDays.playerId, playerIds));
      vacationRows = await database.select().from(playerVacations).where(inArray(playerVacations.playerId, playerIds));
      dnpRows = await database.select().from(playerDoNotPair).where(inArray(playerDoNotPair.playerId, playerIds));
      groupMemberRows = await database.select().from(playerGroupMembers).where(inArray(playerGroupMembers.playerId, playerIds));
    }

    const blockedByPlayer = new Map<number, number[]>();
    for (const bd of blockedDaysRows) {
      const arr = blockedByPlayer.get(bd.playerId) ?? [];
      arr.push(bd.dayOfWeek);
      blockedByPlayer.set(bd.playerId, arr);
    }
    const vacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
    for (const v of vacationRows) {
      const arr = vacsByPlayer.get(v.playerId) ?? [];
      arr.push(v);
      vacsByPlayer.set(v.playerId, arr);
    }
    const dnpByPlayer = new Map<number, number[]>();
    for (const d of dnpRows) {
      const arr = dnpByPlayer.get(d.playerId) ?? [];
      arr.push(d.pairedPlayerId);
      dnpByPlayer.set(d.playerId, arr);
    }
    const gmByPlayer = new Map<number, number[]>();
    for (const gm of groupMemberRows) {
      const arr = gmByPlayer.get(gm.playerId) ?? [];
      arr.push(gm.memberId);
      gmByPlayer.set(gm.playerId, arr);
    }

    const playerData: PlayerData[] = allPlayers.map((p) => ({
      ...p,
      blockedDays: blockedByPlayer.get(p.id) ?? [],
      vacations: vacsByPlayer.get(p.id) ?? [],
      doNotPair: dnpByPlayer.get(p.id) ?? [],
      groupPct: p.groupPct ?? 0,
      groupMembers: gmByPlayer.get(p.id) ?? [],
    }));

    // Only contracted active players (not subs) for Don's auto-assign
    const contractedPlayers = playerData.filter((p) => p.contractedFrequency !== "0");

    // Sub players (frequency "0") — used as fallback if assignCSubs is true
    const subPlayers = playerData.filter((p) => p.contractedFrequency === "0");

    // 5. Compute WTD counts (from earlier weeks + solo assignments this week)
    // We need YTD up to this week for priority, and WTD for owed calculation
    const ytdRows = await database
      .select({ playerId: gameAssignments.playerId, group: games.group, count: sql<number>`count(*)`.as("count") })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(and(eq(games.seasonId, seasonId), eq(games.status, "normal"), sql`${games.weekNumber} <= ${weekNumber}`))
      .groupBy(gameAssignments.playerId, games.group);

    // WTD for Dons should start at 0 since we're filling from empty
    // But we need Solo WTD to know if solo players already played
    const ytdCounts = new Map<number, { ytdDons: number; ytdSolo: number }>();
    for (const row of ytdRows) {
      const entry = ytdCounts.get(row.playerId) ?? { ytdDons: 0, ytdSolo: 0 };
      if (row.group === "dons") entry.ytdDons += row.count;
      if (row.group === "solo") entry.ytdSolo += row.count;
      ytdCounts.set(row.playerId, entry);
    }

    // STD: count ALL assignments across the entire season (for full-season deficit)
    const stdRows = await database
      .select({ playerId: gameAssignments.playerId, count: sql<number>`count(*)`.as("count") })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(and(eq(games.seasonId, seasonId), eq(games.status, "normal"), eq(games.group, "dons")))
      .groupBy(gameAssignments.playerId);

    const stdDonsCounts = new Map<number, number>();
    for (const row of stdRows) {
      stdDonsCounts.set(row.playerId, row.count);
    }


    // 6. Per-day availability check
    const gamesByDate = new Map<string, GameData[]>();
    for (const g of donsGames) {
      const arr = gamesByDate.get(g.date) ?? [];
      arr.push(g);
      gamesByDate.set(g.date, arr);
    }

    // Track who is assigned to solo games on each date (they can't play dons same day)
    const soloAssignedByDate = new Map<string, Set<number>>();
    for (const g of soloGames) {
      const set = soloAssignedByDate.get(g.date) ?? new Set();
      for (const a of g.assignments) set.add(a.playerId);
      soloAssignedByDate.set(g.date, set);
    }

    // Load previous week games for derated pairing check (maxDeratedPerWeek)
    const { seasons } = await import("@/db/schema");
    const [seasonRecord] = await database.select().from(seasons).where(eq(seasons.id, seasonId));
    const maxDeratedPerWeek = seasonRecord?.maxDeratedPerWeek;
    const maxCGamesPerWeek = seasonRecord?.maxCGamesPerWeek ?? 1;
    const maxCGamesPerWeek1x = seasonRecord?.maxCGamesPerWeek1x ?? 4; // weeks between C games for 1x players

    let prevWeekGamesData: GameData[] = [];
    if (maxDeratedPerWeek === 2 && weekNumber > 1) {
      const prevGames = await database.select().from(games)
        .where(and(eq(games.seasonId, seasonId), eq(games.weekNumber, weekNumber - 1)));
      const prevIds = prevGames.map((g) => g.id);
      let prevAssignments: typeof allAssignments = [];
      for (let i = 0; i < prevIds.length; i += BATCH) {
        const batch = prevIds.slice(i, i + BATCH);
        const rows = await database.select().from(gameAssignments).where(inArray(gameAssignments.gameId, batch));
        prevAssignments.push(...rows);
      }
      const prevByGame = new Map<number, typeof prevAssignments>();
      for (const a of prevAssignments) {
        const arr = prevByGame.get(a.gameId) ?? [];
        arr.push(a);
        prevByGame.set(a.gameId, arr);
      }
      prevWeekGamesData = prevGames.map((g) => ({
        ...g,
        assignments: prevByGame.get(g.id) ?? [],
      }));
    }

    // 6a. Vacation-aware front-loading: compute adjusted weekly frequency per player
    // Players with upcoming vacations get a boosted weekly target (up to freq+1) so they
    // accumulate extra games in non-vacation weeks to compensate for missed weeks.
    const totalWeeks = seasonRecord?.totalWeeks ?? 36;
    const contractWeeks = 36; // contractual obligation is always 36 weeks (makeup weeks don't count)

    // Load future Don's game dates (current week through end of season)
    const futureGameRows = await database
      .select({ weekNumber: games.weekNumber, date: games.date, dayOfWeek: games.dayOfWeek })
      .from(games)
      .where(
        and(
          eq(games.seasonId, seasonId),
          eq(games.group, "dons"),
          eq(games.status, "normal"),
          sql`${games.weekNumber} >= ${weekNumber}`
        )
      );

    // Group by week: Map<weekNumber, {date, dayOfWeek}[]> (deduplicated dates)
    const datesByWeek = new Map<number, { date: string; dayOfWeek: number }[]>();
    for (const row of futureGameRows) {
      const arr = datesByWeek.get(row.weekNumber) ?? [];
      if (!arr.some((d) => d.date === row.date)) {
        arr.push({ date: row.date, dayOfWeek: row.dayOfWeek });
      }
      datesByWeek.set(row.weekNumber, arr);
    }

    // Compute adjustedFreq per player
    const adjustedFreqMap = new Map<number, number>();
    for (const p of contractedPlayers) {
      const freq = p.contractedFrequency === "2+" ? 2 : (parseInt(p.contractedFrequency) || 0);
      if (freq === 0) continue;
      if (p.skillLevel === "C") continue; // no vacation makeup for C players

      const ytd = ytdCounts.get(p.id)?.ytdDons ?? 0;
      const totalTarget = freq * contractWeeks;
      const gamesNeeded = totalTarget - ytd;

      if (gamesNeeded <= 0) {
        adjustedFreqMap.set(p.id, freq);
        continue;
      }

      // Count playable weeks: weeks where at least one game date is not vacation/blocked
      let playableWeeksRemaining = 0;
      for (const [, dates] of datesByWeek) {
        const hasPlayableDate = dates.some((d) => {
          if (p.vacations.some((v) => d.date >= v.startDate && d.date <= v.endDate)) return false;
          if (p.blockedDays.includes(d.dayOfWeek)) return false;
          return true;
        });
        if (hasPlayableDate) playableWeeksRemaining++;
      }

      if (playableWeeksRemaining === 0) {
        adjustedFreqMap.set(p.id, freq);
        continue;
      }

      let adjustedFreq = Math.ceil(gamesNeeded / playableWeeksRemaining);
      adjustedFreq = Math.min(adjustedFreq, freq + 1); // cap: at most +1 extra per week
      adjustedFreq = Math.max(adjustedFreq, freq);      // floor: never reduce below normal

      adjustedFreqMap.set(p.id, adjustedFreq);

      if (adjustedFreq > freq) {
        log.push({
          type: "info",
          message: `Front-loading: ${p.lastName} adjusted from ${freq}→${adjustedFreq} games/week (${playableWeeksRemaining} playable of ${datesByWeek.size} remaining weeks, needs ${gamesNeeded} more games)`,
        });
      }
    }

    // 6b. Load historical pairing counts (all prior weeks) for pairing diversity
    // pairingCounts[pairKey(a,b)] = number of times players a & b shared a game
    const pairingCounts = new Map<string, number>();
    function pairKey(a: number, b: number): string {
      return a < b ? `${a}:${b}` : `${b}:${a}`;
    }
    {
      // Load all assigned Don's games from weeks BEFORE this one
      const priorGames = await database.select().from(games)
        .where(and(eq(games.seasonId, seasonId), eq(games.status, "normal"), eq(games.group, "dons"), sql`${games.weekNumber} < ${weekNumber}`));
      const priorIds = priorGames.map((g) => g.id);
      let priorAssignments: { gameId: number; playerId: number }[] = [];
      for (let i = 0; i < priorIds.length; i += BATCH) {
        const batch = priorIds.slice(i, i + BATCH);
        const rows = await database.select({ gameId: gameAssignments.gameId, playerId: gameAssignments.playerId })
          .from(gameAssignments).where(inArray(gameAssignments.gameId, batch));
        priorAssignments.push(...rows);
      }
      // Group by game and count pairs
      const priorByGame = new Map<number, number[]>();
      for (const a of priorAssignments) {
        const arr = priorByGame.get(a.gameId) ?? [];
        arr.push(a.playerId);
        priorByGame.set(a.gameId, arr);
      }
      for (const playerIds of priorByGame.values()) {
        for (let i = 0; i < playerIds.length; i++) {
          for (let j = i + 1; j < playerIds.length; j++) {
            const key = pairKey(playerIds[i], playerIds[j]);
            pairingCounts.set(key, (pairingCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }

    // Also count existing pairings in current week's partial games
    for (const g of donsGames) {
      if (g.assignments.length >= 2) {
        const pids = g.assignments.map((a) => a.playerId);
        for (let i = 0; i < pids.length; i++) {
          for (let j = i + 1; j < pids.length; j++) {
            const key = pairKey(pids[i], pids[j]);
            pairingCounts.set(key, (pairingCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }

    // Helper: get total pairing count between a candidate and players already in a game
    function getPairingPenalty(candidateId: number, assignedIds: number[]): number {
      let total = 0;
      for (const id of assignedIds) {
        total += pairingCounts.get(pairKey(candidateId, id)) ?? 0;
      }
      return total;
    }

    // Helper: update pairing counts when a player is assigned to a game
    function recordPairings(newPlayerId: number, existingPlayerIds: number[]): void {
      for (const id of existingPlayerIds) {
        const key = pairKey(newPlayerId, id);
        pairingCounts.set(key, (pairingCounts.get(key) ?? 0) + 1);
      }
    }

    // 7. Run the assignment algorithm
    // Track assignments made: playerId → dates assigned this week
    const wtdDonsCounts = new Map<number, number>(); // running WTD for dons
    const assignedDates = new Map<number, Set<string>>(); // player → dates assigned
    const createdAssignmentIds: number[] = [];

    // Initialize from existing Don's assignments (for partial game fill)
    for (const g of donsGames) {
      for (const a of g.assignments) {
        wtdDonsCounts.set(a.playerId, (wtdDonsCounts.get(a.playerId) ?? 0) + 1);
        const dates = assignedDates.get(a.playerId) ?? new Set();
        dates.add(g.date);
        assignedDates.set(a.playerId, dates);
      }
    }

    // Initialize from solo assignments (players already playing on certain dates)
    for (const [date, pids] of soloAssignedByDate) {
      for (const pid of pids) {
        const dates = assignedDates.get(pid) ?? new Set();
        dates.add(date);
        assignedDates.set(pid, dates);
      }
    }

    // Get available players for a specific game considering all constraints
    // firstGameOnly: if true, only include players with ZERO Don's games this week
    //   (ensures every contracted player gets at least 1 game before anyone gets a 2nd).
    //   If false, include all players who still owe games or are 2+ eligible for extras.
    // options.allowExtras: if true, 2+ players are not capped at 2 games/week (for Pass 3)
    // options.playerPool: custom player pool to search (e.g. subPlayers for Pass 4)
    function getAvailablePlayers(
      game: GameData, currentAssignments: number[], firstGameOnly = false,
      options?: { allowExtras?: boolean; playerPool?: PlayerData[]; isSubs?: boolean }
    ): PlayerData[] {
      const pool = options?.playerPool ?? contractedPlayers;
      const isSubs = !!options?.isSubs;
      const assignedInGame = new Set(currentAssignments);
      const assignedOnDate = new Set<number>();
      // Players assigned to other games on same date
      for (const g of donsGames) {
        if (g.id === game.id) continue;
        if (g.date !== game.date) continue;
        const ga = gameAssignmentState.get(g.id) ?? [];
        for (const pid of ga) assignedOnDate.add(pid);
      }
      // Also solo players on this date
      const soloOnDate = soloAssignedByDate.get(game.date) ?? new Set();
      for (const pid of soloOnDate) assignedOnDate.add(pid);

      return pool.filter((p) => {
        if (assignedInGame.has(p.id)) return false;

        // No player can play twice on the same date
        if (assignedOnDate.has(p.id)) return false;

        // Frequency / owed check
        if (isSubs) {
          // Subs have no contracted frequency — skip frequency/owed checks entirely
        } else {
          const wtd = wtdDonsCounts.get(p.id) ?? 0;
          // Season-total cap: non-2+ players cannot exceed freq × 36 games
          if (p.contractedFrequency !== "2+") {
            const freq = parseInt(p.contractedFrequency) || 0;
            const ytd = ytdCounts.get(p.id)?.ytdDons ?? 0;
            if (ytd >= freq * contractWeeks) return false;
          }
          if (firstGameOnly) {
            // Only players who have zero Don's games this week
            if (wtd > 0) return false;
          } else if (p.contractedFrequency === "2+") {
            // In normal mode (Pass 2), 2+ players are always eligible
            // (the 2-game cap is enforced in the caller's filter, not here)
            // In extras mode (Pass 3), allowExtras lifts that caller-side cap
          } else {
            // Non-2+ players: only eligible if WTD owed > 0 at BASE frequency
            // (front-loading extras are handled in a separate pass to avoid
            // stealing slots from players who haven't met their base contract)
            const freq = parseInt(p.contractedFrequency) || 0;
            if (freq - wtd <= 0) {
              // Allow through if allowExtras and player has front-loaded adjusted freq
              if (options?.allowExtras) {
                const adjFreq = adjustedFreqMap.get(p.id) ?? freq;
                if (adjFreq > freq && wtd < adjFreq) {
                  // eligible — front-loaded player, let Pass 2.5 filter handle it
                } else {
                  return false;
                }
              } else {
                return false;
              }
            }
          }
        }

        // Blocked day
        if (p.blockedDays.includes(game.dayOfWeek)) return false;

        // No early games
        if (p.noEarlyGames && game.startTime < "10:00") return false;

        // Vacation
        if (p.vacations.some((v) => game.date >= v.startDate && game.date <= v.endDate)) return false;

        // No consecutive days: skip if player is assigned on the day before or day after
        if (p.noConsecutiveDays) {
          const gameDate = new Date(game.date + "T12:00:00");
          const prevDay = new Date(gameDate);
          prevDay.setDate(prevDay.getDate() - 1);
          const nextDay = new Date(gameDate);
          nextDay.setDate(nextDay.getDate() + 1);
          const prevStr = prevDay.toISOString().split("T")[0];
          const nextStr = nextDay.toISOString().split("T")[0];
          const pDates = assignedDates.get(p.id) ?? new Set();
          if (pDates.has(prevStr) || pDates.has(nextStr)) return false;
        }

        // Do-not-pair with anyone already in this game
        if (p.doNotPair.length) {
          for (const assignedId of assignedInGame) {
            if (p.doNotPair.includes(assignedId)) return false;
          }
        }
        // Reverse DNP check — use playerData so we find both contracted and sub players
        for (const assignedId of assignedInGame) {
          const assignedPlayer = playerData.find((pl) => pl.id === assignedId);
          if (assignedPlayer?.doNotPair.includes(p.id)) return false;
        }

        // A players without cGamesOk must never share a game with C players (either direction)
        if (p.skillLevel === "A" && !p.cGamesOk) {
          for (const assignedId of assignedInGame) {
            const ap = playerData.find((pl) => pl.id === assignedId);
            if (ap?.skillLevel === "C") return false;
          }
        }
        if (p.skillLevel === "C") {
          for (const assignedId of assignedInGame) {
            const ap = playerData.find((pl) => pl.id === assignedId);
            if (ap?.skillLevel === "A" && !ap?.cGamesOk) return false;
          }
        }

        // Derated pairing limit: check both directions
        // - If candidate is derated, check if any assigned non-derated player already paired with them
        // - If candidate is non-derated, check if any assigned derated player already paired with them
        if (maxDeratedPerWeek != null) {
          const gamesToCheck = [...donsGames.map((g) => ({
            ...g,
            assignments: (gameAssignmentState.get(g.id) ?? []).map((pid, idx) => ({ playerId: pid, slotPosition: idx + 1 })),
          }))];
          if (maxDeratedPerWeek === 2) {
            gamesToCheck.push(...prevWeekGamesData.map((g) => ({
              ...g,
              assignments: g.assignments.map((a) => ({ playerId: a.playerId, slotPosition: a.slotPosition })),
            })));
          }

          for (const assignedId of assignedInGame) {
            const assignedPlayer = playerData.find((pl) => pl.id === assignedId);
            if (!assignedPlayer) continue;
            // One must be derated, the other not — skip if both derated or both non-derated
            const oneDerated = p.isDerated !== assignedPlayer.isDerated;
            if (!oneDerated) continue;

            let alreadyPaired = false;
            for (const g of gamesToCheck) {
              if (g.status !== "normal") continue;
              if (g.id === game.id) continue;
              const inGame = g.assignments.some((a) => a.playerId === assignedId);
              if (!inGame) continue;
              if (g.assignments.some((a) => a.playerId === p.id)) {
                alreadyPaired = true;
                break;
              }
            }
            if (alreadyPaired) return false;
          }
        }

        return true;
      });
    }

    // Track assignment state per game (player IDs assigned)
    // Initialize from existing assignments so partial games are handled correctly
    const gameAssignmentState = new Map<number, number[]>();
    for (const g of donsGames) {
      gameAssignmentState.set(g.id, g.assignments.map((a) => a.playerId));
    }

    // Track group game fulfillment per group head
    const groupTotalGames = new Map<number, number>(); // head → total games assigned
    const groupGroupGames = new Map<number, number>(); // head → games where all 3 co-players from group
    for (const p of playerData) {
      if (p.groupPct > 0 && p.groupMembers.length > 0) {
        let totalGames = 0;
        let groupGames = 0;
        for (const g of donsGames) {
          const assigned = g.assignments.map((a) => a.playerId);
          if (!assigned.includes(p.id)) continue;
          totalGames++;
          const coPlayers = assigned.filter((pid) => pid !== p.id);
          if (coPlayers.length === 3 && coPlayers.every((pid) => p.groupMembers.includes(pid))) {
            groupGames++;
          }
        }
        groupTotalGames.set(p.id, totalGames);
        groupGroupGames.set(p.id, groupGames);
      }
    }

    // Priority scoring for a player
    function getPlayerPriority(p: PlayerData, game: GameData): { mustPlay: boolean; owed: number; ytdDeficit: number; stdDeficit: number; playableDaysLeft: number } {
      const freq = parseInt(p.contractedFrequency) || 0;
      const wtd = wtdDonsCounts.get(p.id) ?? 0;
      const owed = freq - wtd;
      const ytd = ytdCounts.get(p.id)?.ytdDons ?? 0;
      const expectedYtd = freq * Math.min(weekNumber, contractWeeks);
      const ytdDeficit = expectedYtd - ytd;
      const std = stdDonsCounts.get(p.id) ?? 0;
      const stdDeficit = freq * contractWeeks - std;

      // Count remaining playable dates this week (not yet assigned on)
      const playerDates = assignedDates.get(p.id) ?? new Set();
      const playableDates: string[] = [];
      for (const [date, dateGames] of gamesByDate) {
        if (playerDates.has(date)) continue;
        const dow = dateGames[0].dayOfWeek;
        if (p.blockedDays.includes(dow)) continue;
        if (p.vacations.some((v) => date >= v.startDate && date <= v.endDate)) continue;
        const hasOpen = dateGames.some((g) => (gameAssignmentState.get(g.id) ?? []).length < 4);
        if (hasOpen) playableDates.push(date);
      }

      // Must-play: only one playable date left this week and they still owe
      const mustPlay = owed > 0 && playableDates.length === 1 && playableDates[0] === game.date;

      return { mustPlay, owed, ytdDeficit, stdDeficit, playableDaysLeft: playableDates.length };
    }

    // Pre-compute last C-game week for each cGamesOk player (for frequency limits)
    // Look back the max of both intervals to cover both 1x and 2x players
    const lastCGameWeek = new Map<number, number>(); // playerId → most recent week with a C-game
    {
      const maxLookback = Math.max(maxCGamesPerWeek ?? 0, maxCGamesPerWeek1x ?? 0);
      if (maxLookback > 0) {
        const lookbackStart = Math.max(1, weekNumber - maxLookback + 1);
        if (lookbackStart < weekNumber) {
          const recentGames = await database
            .select({ id: games.id, weekNumber: games.weekNumber })
            .from(games)
            .where(and(
              eq(games.seasonId, seasonId),
              eq(games.group, "dons"),
              eq(games.status, "normal"),
              sql`${games.weekNumber} >= ${lookbackStart} AND ${games.weekNumber} < ${weekNumber}`
            ));

          if (recentGames.length > 0) {
            const gameWeekMap = new Map<number, number>();
            for (const g of recentGames) gameWeekMap.set(g.id, g.weekNumber);

            const recentAssignments = await database
              .select({ gameId: gameAssignments.gameId, playerId: gameAssignments.playerId })
              .from(gameAssignments)
              .where(inArray(gameAssignments.gameId, recentGames.map((g) => g.id)));

            // Group assignments by game
            const assignmentsByGame = new Map<number, number[]>();
            for (const a of recentAssignments) {
              const arr = assignmentsByGame.get(a.gameId) ?? [];
              arr.push(a.playerId);
              assignmentsByGame.set(a.gameId, arr);
            }

            // Find cGamesOk players who were in a game with a C player
            for (const [gameId, pids] of assignmentsByGame) {
              const hasC = pids.some((pid) => {
                const p = playerData.find((pl) => pl.id === pid);
                return p?.skillLevel === "C";
              });
              if (!hasC) continue;
              const gWeek = gameWeekMap.get(gameId) ?? 0;
              for (const pid of pids) {
                const p = playerData.find((pl) => pl.id === pid);
                if (p && p.cGamesOk && p.skillLevel !== "C") {
                  const prev = lastCGameWeek.get(pid) ?? 0;
                  if (gWeek > prev) lastCGameWeek.set(pid, gWeek);
                }
              }
            }
          }
        }
      }
    }

    // Per-day availability report
    let pass28Count = 0;
    let pass3Count = 0;
    let pass35Count = 0;
    let pass4Count = 0;
    // Track how many C-player games each cGamesOk player has been assigned this week
    const cGameWtdCounts = new Map<number, number>();
    for (const [date, dateGames] of gamesByDate) {
      const dow = dateGames[0].dayOfWeek;
      const slotsNeeded = dateGames.length * 4;
      const soloOnDate = soloAssignedByDate.get(date) ?? new Set();

      const available = contractedPlayers.filter((p) => {
        if (soloOnDate.has(p.id)) return false;
        if (p.blockedDays.includes(dow)) return false;
        if (p.vacations.some((v) => date >= v.startDate && date <= v.endDate)) return false;
        // Only count players who deserve games at base contracted frequency
        if (p.contractedFrequency === "2+") return true;
        const freq = parseInt(p.contractedFrequency) || 0;
        const wtd = wtdDonsCounts.get(p.id) ?? 0;
        if (freq - wtd > 0) return true;
        return false;
      });

      log.push({
        type: available.length < slotsNeeded ? "warning" : "info",
        day: DAYS[dow],
        message: `${DAYS[dow]} (${date}): ${available.length} eligible players, ${slotsNeeded} slots needed${available.length < slotsNeeded ? ` — SHORTFALL of ${slotsNeeded - available.length}` : ""}`,
      });
    }

    // 8. Assign day by day, game by game
    // Strategy: process tightest days first (fewest surplus players) so the most
    // constrained days get first pick from the full pool of unassigned players.
    const dayEntries = [...gamesByDate.entries()];
    dayEntries.sort((a, b) => {
      const [dateA, gamesA] = a;
      const [dateB, gamesB] = b;
      const dowA = gamesA[0].dayOfWeek;
      const dowB = gamesB[0].dayOfWeek;
      const soloA = soloAssignedByDate.get(dateA) ?? new Set();
      const soloB = soloAssignedByDate.get(dateB) ?? new Set();
      const poolA = contractedPlayers.filter((p) => {
        if (soloA.has(p.id)) return false;
        if (p.blockedDays.includes(dowA)) return false;
        if (p.vacations.some((v) => dateA >= v.startDate && dateA <= v.endDate)) return false;
        return true;
      }).length;
      const poolB = contractedPlayers.filter((p) => {
        if (soloB.has(p.id)) return false;
        if (p.blockedDays.includes(dowB)) return false;
        if (p.vacations.some((v) => dateB >= v.startDate && dateB <= v.endDate)) return false;
        return true;
      }).length;
      const surplusA = poolA - gamesA.length * 4;
      const surplusB = poolB - gamesB.length * 4;
      return surplusA - surplusB; // tightest first
    });

    // Composition quality score (0-4, higher is better):
    //   4 = all same level (AAAA, BBBB, CCCC)
    //   3 = adjacent levels only (AABB, ABBB, BBBC, BBCC)
    //   2 = A+C with good bridge (2+ B's — e.g., ABBC)
    //   1 = A+C with weak bridge (1 B — e.g., ABAC)
    //   0 = A+C with no bridge (e.g., AACC, ACCC)
    function getCompositionScore(pids: number[]): number {
      const levels = pids.map((id) => playerData.find((p) => p.id === id)?.skillLevel ?? "B");
      const aCount = levels.filter((l) => l === "A").length;
      const bCount = levels.filter((l) => l === "B").length;
      const cCount = levels.filter((l) => l === "C").length;
      const hasA = aCount > 0;
      const hasC = cCount > 0;

      if (!hasA || !hasC) {
        const distinct = new Set(levels).size;
        return distinct === 1 ? 4 : 3;
      }
      if (bCount >= 2) return 2;
      if (bCount === 1) return 1;
      return 0;
    }

    // Check if a game has an A player (without cGamesOk) paired with a C player
    function hasACViolation(pids: number[]): boolean {
      const pls = pids.map((id) => playerData.find((p) => p.id === id));
      const hasC = pls.some((p) => p?.skillLevel === "C");
      const hasANoCGames = pls.some((p) => p?.skillLevel === "A" && !p?.cGamesOk);
      return hasC && hasANoCGames;
    }

    for (const [date, dateGames] of dayEntries) {
      const dow = dateGames[0].dayOfWeek;

      const openGames = dateGames.filter((g) => (gameAssignmentState.get(g.id) ?? []).length < 4);

      // Sort players by priority:
      //   1. mustPlay (critical — only 1 day left and still owe)
      //   2. owed (more owed = higher priority)
      //   3. pairing diversity (fewer prior pairings with game members = higher priority)
      //   4. playableDaysLeft (fewer = higher priority)
      //   5. ytdDeficit (more behind = higher priority)
      //   6. random tiebreaker
      const sortByPriority = (players: PlayerData[], game: GameData) => {
        const currentAssignedIds = gameAssignmentState.get(game.id) ?? [];

        // Composition quality penalty: prefer candidates that maintain/improve game composition
        // Uses a hypothetical roster to compute quality score with vs without the candidate
        function compositionPenalty(p: PlayerData): number {
          if (currentAssignedIds.length === 0) return 0;
          const hypothetical = [...currentAssignedIds, p.id];
          const levels = hypothetical.map((id) => {
            if (id === p.id) return p.skillLevel;
            return playerData.find((pl) => pl.id === id)?.skillLevel ?? "B";
          });
          const aCount = levels.filter((l) => l === "A").length;
          const bCount = levels.filter((l) => l === "B").length;
          const cCount = levels.filter((l) => l === "C").length;
          const hasA = aCount > 0;
          const hasC = cCount > 0;
          if (!hasA || !hasC) return 0; // no A+C gap, no penalty
          if (bCount >= 2) return 1; // bridged but still A+C
          if (bCount === 1) return 2; // weakly bridged
          return 3; // no bridge — worst
        }

        return [...players].sort((a, b) => {
          const pa = getPlayerPriority(a, game);
          const pb = getPlayerPriority(b, game);
          if (pa.mustPlay !== pb.mustPlay) return pa.mustPlay ? -1 : 1;
          // Composition: prefer players that don't create A+C violations
          const compA = compositionPenalty(a);
          const compB = compositionPenalty(b);
          if (compA !== compB) return compA - compB;
          // Pairing diversity: prefer candidates who've been paired LESS with current game members
          if (currentAssignedIds.length > 0) {
            const penaltyA = getPairingPenalty(a.id, currentAssignedIds);
            const penaltyB = getPairingPenalty(b.id, currentAssignedIds);
            if (penaltyA !== penaltyB) return penaltyA - penaltyB;
          }
          if (pb.owed !== pa.owed) return pb.owed - pa.owed;
          if (pa.playableDaysLeft !== pb.playableDaysLeft) return pa.playableDaysLeft - pb.playableDaysLeft;
          if (pb.ytdDeficit !== pa.ytdDeficit) return pb.ytdDeficit - pa.ytdDeficit;
          if (pb.stdDeficit !== pa.stdDeficit) return pb.stdDeficit - pa.stdDeficit;
          return Math.random() - 0.5;
        });
      };

      // Track used players on this day
      const usedOnDay = new Set<number>();
      for (const g of dateGames) {
        const assigned = gameAssignmentState.get(g.id) ?? [];
        for (const pid of assigned) usedOnDay.add(pid);
      }

      // Helper: assign a player to a game slot
      async function assignPlayer(game: GameData, playerId: number, slotPos: number): Promise<boolean> {
        try {
          const result = await database.insert(gameAssignments).values({
            gameId: game.id,
            slotPosition: slotPos,
            playerId,
            isPrefill: false,
          }).returning();

          createdAssignmentIds.push(result[0].id);
          const state = gameAssignmentState.get(game.id) ?? [];
          // Update pairing counts with all players already in this game
          recordPairings(playerId, state);
          state.push(playerId);
          gameAssignmentState.set(game.id, state);

          // Update tracking
          const wtd = (wtdDonsCounts.get(playerId) ?? 0) + 1;
          wtdDonsCounts.set(playerId, wtd);
          const dates = assignedDates.get(playerId) ?? new Set();
          dates.add(game.date);
          assignedDates.set(playerId, dates);
          usedOnDay.add(playerId);

          // Update YTD and STD counts too
          const ytdEntry = ytdCounts.get(playerId) ?? { ytdDons: 0, ytdSolo: 0 };
          ytdEntry.ytdDons += 1;
          ytdCounts.set(playerId, ytdEntry);
          stdDonsCounts.set(playerId, (stdDonsCounts.get(playerId) ?? 0) + 1);

          return true;
        } catch (err) {
          log.push({ type: "error", day: DAYS[dow], message: `Failed to assign player ${playerId} to game #${game.gameNumber}: ${err}` });
          return false;
        }
      }

      // --- Unified assignment: all games treated equally, B and C in one pool ---

      for (const game of openGames) {
        const existingCount = (gameAssignmentState.get(game.id) ?? []).length;
        for (let slot = existingCount + 1; slot <= 4; slot++) {
          const currentAssigned = gameAssignmentState.get(game.id) ?? [];

          // --- Group-filling logic ---
          // Check if any assigned player is a group head needing group games
          let groupFilled = false;
          for (const assignedId of currentAssigned) {
            const headPlayer = playerData.find((p) => p.id === assignedId);
            if (!headPlayer || headPlayer.groupPct === 0 || headPlayer.groupMembers.length === 0) continue;

            // Calculate current group ratio for this head
            const total = groupTotalGames.get(assignedId) ?? 0;
            const grp = groupGroupGames.get(assignedId) ?? 0;
            const targetRatio = headPlayer.groupPct / 100;
            const currentRatio = total > 0 ? grp / total : 0;

            if (currentRatio < targetRatio) {
              // Try group-exclusive filling
              const groupMemberSet = new Set(headPlayer.groupMembers);
              const groupPool = contractedPlayers.filter((p) => groupMemberSet.has(p.id));
              let groupEligible = getAvailablePlayers(game, currentAssigned, false, { playerPool: groupPool }).filter((p) => {
                if (usedOnDay.has(p.id)) return false;
                return true;
              });
              // Also try first-game-only pass for fairness
              if (groupEligible.length === 0) {
                groupEligible = getAvailablePlayers(game, currentAssigned, true, { playerPool: groupPool }).filter((p) => {
                  if (usedOnDay.has(p.id)) return false;
                  return true;
                });
              }

              if (groupEligible.length > 0) {
                // Random selection among eligible group members to distribute play evenly
                const chosen = groupEligible[Math.floor(Math.random() * groupEligible.length)];
                log.push({
                  type: "info",
                  day: DAYS[dow],
                  message: `Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} assigned from ${headPlayer.lastName} Group`,
                });
                await assignPlayer(game, chosen.id, slot);
                groupFilled = true;
                break;
              } else {
                log.push({
                  type: "info",
                  day: DAYS[dow],
                  message: `Game #${game.gameNumber} slot ${slot}: no ${headPlayer.lastName} Group members available, using normal pool`,
                });
              }
            }
            break; // only process first group head found
          }
          if (groupFilled) continue; // skip normal passes

          let passUsed = 1;

          // First pass: only players with zero Don's games this week (everyone gets at least 1)
          let eligible = getAvailablePlayers(game, currentAssigned, true).filter((p) => {
            if (usedOnDay.has(p.id)) return false;
            return true;
          });
          // Second pass: players who still owe games (freq - wtd > 0), including 2+ players
          // who haven't hit their minimum of 2 yet. Does NOT include 2+ extras beyond minimum.
          if (eligible.length === 0) {
            passUsed = 2;
            eligible = getAvailablePlayers(game, currentAssigned, false).filter((p) => {
              if (usedOnDay.has(p.id)) return false;
              // Block 2+ players who've already met their minimum — no over-assignment
              if (p.contractedFrequency === "2+") {
                const wtd = wtdDonsCounts.get(p.id) ?? 0;
                if (wtd >= 2) return false;
              }
              return true;
            });
          }
          // Pass 2.5: front-loading — players whose adjustedFreq > base freq and
          // who've met their base contract but still owe front-loaded games.
          // Runs AFTER base-frequency assignments so it never steals from contracted games.
          if (eligible.length === 0) {
            const frontLoadEligible = getAvailablePlayers(game, currentAssigned, false, { allowExtras: true }).filter((p) => {
              if (usedOnDay.has(p.id)) return false;
              const freq = p.contractedFrequency === "2+" ? 2 : (parseInt(p.contractedFrequency) || 0);
              const effectiveFreq = adjustedFreqMap.get(p.id) ?? freq;
              if (effectiveFreq <= freq) return false; // no front-loading needed
              const wtd = wtdDonsCounts.get(p.id) ?? 0;
              if (wtd < freq) return false; // hasn't met base contract yet (shouldn't happen here)
              if (wtd >= effectiveFreq) return false; // already met front-loaded target
              return true;
            });
            if (frontLoadEligible.length > 0) {
              passUsed = 2.5;
              eligible = frontLoadEligible;
            }
          }
          // Pass 2.8: cGamesOk — A/B players willing to play in games with C players
          // Only fires when the game already has at least one C-level player assigned
          if (eligible.length === 0) {
            const currentPlayers = gameAssignmentState.get(game.id) ?? [];
            const hasCPlayer = currentPlayers.some((pid) => {
              const pl = playerData.find((p) => p.id === pid);
              return pl?.skillLevel === "C";
            });
            if (hasCPlayer) {
              const cGameOkEligible = getAvailablePlayers(game, currentAssigned, false, { allowExtras: true }).filter((p) => {
                if (usedOnDay.has(p.id)) return false;
                if (!p.cGamesOk) return false;
                if (p.skillLevel === "C") return false; // C players don't need this pass
                // Already assigned a C-game this week — block (at most 1 per week for any player)
                if ((cGameWtdCounts.get(p.id) ?? 0) > 0) return false;
                // Check interval-based limit using recent history
                const freq = parseInt(p.contractedFrequency) || 0;
                const interval = freq === 1 ? maxCGamesPerWeek1x : maxCGamesPerWeek;
                if (interval != null && interval > 1) {
                  const lastWeek = lastCGameWeek.get(p.id) ?? 0;
                  if (lastWeek > 0 && weekNumber - lastWeek < interval) return false;
                }
                return true;
              });
              if (cGameOkEligible.length > 0) {
                passUsed = 2.8;
                eligible = cGameOkEligible;
              }
            }
          }
          // Pass 3: extras — allow 2+ players beyond their weekly minimum of 2
          if (eligible.length === 0 && assignExtra) {
            passUsed = 3;
            eligible = getAvailablePlayers(game, currentAssigned, false, { allowExtras: true }).filter((p) => {
              if (usedOnDay.has(p.id)) return false;
              return true;
            });
          }
          // Pass 3.5: STD catchup — contracted players with season-total deficit
          if (eligible.length === 0 && assignStdCatchup) {
            const stdCatchupEligible = getAvailablePlayers(game, currentAssigned, false, { allowExtras: true }).filter((p) => {
              if (usedOnDay.has(p.id)) return false;
              if (p.contractedFrequency === "0") return false; // not subs
              const freq = p.contractedFrequency === "2+" ? 2 : (parseInt(p.contractedFrequency) || 0);
              if (freq === 0) return false;
              const std = stdDonsCounts.get(p.id) ?? 0;
              return freq * contractWeeks - std > 0; // has season deficit
            });
            if (stdCatchupEligible.length > 0) {
              passUsed = 3.5;
              eligible = stdCatchupEligible;
            }
          }
          // Pass 4: subs — allow substitute players to fill remaining gaps
          if (eligible.length === 0 && assignCSubs) {
            passUsed = 4;
            eligible = getAvailablePlayers(game, currentAssigned, false, { playerPool: subPlayers, isSubs: true }).filter((p) => {
              if (usedOnDay.has(p.id)) return false;
              return true;
            });
          }

          const prioritized = sortByPriority(eligible, game);

          if (prioritized.length > 0) {
            const chosen = prioritized[0];
            if (passUsed === 2.5) {
              log.push({ type: "info", day: DAYS[dow], message: `[Pass 2.5] Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} assigned as FRONT-LOAD (vacation make-up)` });
            } else if (passUsed === 2.8) {
              pass28Count++;
              cGameWtdCounts.set(chosen.id, (cGameWtdCounts.get(chosen.id) ?? 0) + 1);
              lastCGameWeek.set(chosen.id, weekNumber);
              log.push({ type: "info", day: DAYS[dow], message: `[Pass 2.8] Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} (${chosen.skillLevel}) assigned as C-GAME-OK (A/B player in C-player game)` });
            } else if (passUsed === 3) {
              pass3Count++;
              log.push({ type: "info", day: DAYS[dow], message: `[Pass 3] Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} assigned as EXTRA (2+ beyond weekly min)` });
            } else if (passUsed === 3.5) {
              pass35Count++;
              const freq = chosen.contractedFrequency === "2+" ? 2 : (parseInt(chosen.contractedFrequency) || 0);
              const std = stdDonsCounts.get(chosen.id) ?? 0;
              log.push({ type: "info", day: DAYS[dow], message: `[Pass 3.5] Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} assigned as STD-CATCHUP (season deficit: ${freq * contractWeeks - std} games behind)` });
            } else if (passUsed === 4) {
              pass4Count++;
              log.push({ type: "info", day: DAYS[dow], message: `[Pass 4] Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} assigned as SUB` });
            } else if (usedOnDay.has(chosen.id)) {
              log.push({ type: "info", day: DAYS[dow], message: `[Pass 2] Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} assigned as BONUS (extra game on same day)` });
            }
            await assignPlayer(game, chosen.id, slot);
          } else {
            const hints: string[] = [];
            if (!assignExtra) hints.push("extras");
            if (!assignCSubs) hints.push("C subs");
            const hintStr = hints.length > 0 ? ` (enable ${hints.join(" and ")} for more options)` : "";
            log.push({
              type: "warning",
              day: DAYS[dow],
              message: `Game #${game.gameNumber} slot ${slot}: no eligible player found${hintStr} — slot left empty`,
            });
          }
        }

        // --- Update group tracking after game is filled ---
        const finalAssigned = gameAssignmentState.get(game.id) ?? [];
        if (finalAssigned.length === 4) {
          for (const pid of finalAssigned) {
            const headPlayer = playerData.find((p) => p.id === pid);
            if (!headPlayer || headPlayer.groupPct === 0 || headPlayer.groupMembers.length === 0) continue;
            // This player is a group head — update their tracking
            const prevTotal = groupTotalGames.get(pid) ?? 0;
            groupTotalGames.set(pid, prevTotal + 1);
            const coPlayers = finalAssigned.filter((id) => id !== pid);
            if (coPlayers.every((id) => headPlayer.groupMembers.includes(id))) {
              const prevGroup = groupGroupGames.get(pid) ?? 0;
              groupGroupGames.set(pid, prevGroup + 1);
            }
          }
        }
      }

      // --- Day-level composition optimization ---
      // After filling all games on this day, try swapping players between games
      // to improve composition quality (group similar skill levels together).
      const filledDayGames = openGames.filter((g) => (gameAssignmentState.get(g.id) ?? []).length === 4);

      const dayStates = filledDayGames.map((g) => ({
        game: g,
        players: [...(gameAssignmentState.get(g.id) ?? [])],
      }));

      // Identify group games (head + all 3 co-players from head's group) — protect from swaps
      const groupGameIds = new Set<number>();
      for (const gs of dayStates) {
        for (const pid of gs.players) {
          const head = playerData.find((p) => p.id === pid);
          if (!head || head.groupPct === 0 || head.groupMembers.length === 0) continue;
          const coPlayers = gs.players.filter((id) => id !== pid);
          if (coPlayers.every((id) => head.groupMembers.includes(id))) {
            groupGameIds.add(gs.game.id);
          }
        }
      }

      let swapMade = true;
      while (swapMade) {
        swapMade = false;
        for (let i = 0; i < dayStates.length && !swapMade; i++) {
          // Skip group-protected games
          if (groupGameIds.has(dayStates[i].game.id)) continue;
          for (let j = i + 1; j < dayStates.length && !swapMade; j++) {
            // Skip group-protected games
            if (groupGameIds.has(dayStates[j].game.id)) continue;
            for (let pi = 0; pi < 4 && !swapMade; pi++) {
              for (let pj = 0; pj < 4 && !swapMade; pj++) {
                const pidI = dayStates[i].players[pi];
                const pidJ = dayStates[j].players[pj];
                if (pidI === pidJ) continue;

                // Build swapped rosters
                const newI = [...dayStates[i].players]; newI[pi] = pidJ;
                const newJ = [...dayStates[j].players]; newJ[pj] = pidI;

                const oldScore = getCompositionScore(dayStates[i].players)
                               + getCompositionScore(dayStates[j].players);
                const newScore = getCompositionScore(newI)
                               + getCompositionScore(newJ);

                if (newScore <= oldScore) continue;

                // Block swaps that create 1x-A + C violations
                if (hasACViolation(newI) || hasACViolation(newJ)) continue;

                // Verify DNP constraints in new rosters
                let dnpOk = true;
                const pI = playerData.find((p) => p.id === pidI);
                const pJ = playerData.find((p) => p.id === pidJ);
                for (const otherId of newI) {
                  if (otherId === pidJ) continue;
                  if (pJ?.doNotPair.includes(otherId)) { dnpOk = false; break; }
                  const other = playerData.find((p) => p.id === otherId);
                  if (other?.doNotPair.includes(pidJ)) { dnpOk = false; break; }
                }
                if (dnpOk) {
                  for (const otherId of newJ) {
                    if (otherId === pidI) continue;
                    if (pI?.doNotPair.includes(otherId)) { dnpOk = false; break; }
                    const other = playerData.find((p) => p.id === otherId);
                    if (other?.doNotPair.includes(pidI)) { dnpOk = false; break; }
                  }
                }
                if (!dnpOk) continue;

                // Verify derated pairing limits in new rosters
                let deratedOk = true;
                if (maxDeratedPerWeek != null) {
                  const gamesToCheck = [...donsGames.map((g) => ({
                    ...g,
                    assignments: (gameAssignmentState.get(g.id) ?? []).map((pid, idx) => ({ playerId: pid, slotPosition: idx + 1 })),
                  }))];
                  if (maxDeratedPerWeek === 2) {
                    gamesToCheck.push(...prevWeekGamesData.map((g) => ({
                      ...g,
                      assignments: g.assignments.map((a) => ({ playerId: a.playerId, slotPosition: a.slotPosition })),
                    })));
                  }

                  // Check pidJ in game i (new roster newI)
                  for (const otherId of newI) {
                    if (otherId === pidJ) continue;
                    const otherPlayer = playerData.find((p) => p.id === otherId);
                    if (!otherPlayer || !pJ) continue;
                    if (pJ.isDerated === otherPlayer.isDerated) continue;
                    let alreadyPaired = false;
                    for (const g of gamesToCheck) {
                      if (g.status !== "normal") continue;
                      if (g.id === dayStates[i].game.id || g.id === dayStates[j].game.id) continue;
                      const inGame = g.assignments.some((a) => a.playerId === otherId);
                      if (!inGame) continue;
                      if (g.assignments.some((a) => a.playerId === pidJ)) { alreadyPaired = true; break; }
                    }
                    if (alreadyPaired) { deratedOk = false; break; }
                  }
                  // Check pidI in game j (new roster newJ)
                  if (deratedOk) {
                    for (const otherId of newJ) {
                      if (otherId === pidI) continue;
                      const otherPlayer = playerData.find((p) => p.id === otherId);
                      if (!otherPlayer || !pI) continue;
                      if (pI.isDerated === otherPlayer.isDerated) continue;
                      let alreadyPaired = false;
                      for (const g of gamesToCheck) {
                        if (g.status !== "normal") continue;
                        if (g.id === dayStates[i].game.id || g.id === dayStates[j].game.id) continue;
                        const inGame = g.assignments.some((a) => a.playerId === otherId);
                        if (!inGame) continue;
                        if (g.assignments.some((a) => a.playerId === pidI)) { alreadyPaired = true; break; }
                      }
                      if (alreadyPaired) { deratedOk = false; break; }
                    }
                  }
                }
                if (!deratedOk) continue;

                // Apply swap in DB
                const [rowI] = await database.select().from(gameAssignments)
                  .where(and(eq(gameAssignments.gameId, dayStates[i].game.id), eq(gameAssignments.playerId, pidI)));
                const [rowJ] = await database.select().from(gameAssignments)
                  .where(and(eq(gameAssignments.gameId, dayStates[j].game.id), eq(gameAssignments.playerId, pidJ)));
                if (rowI && rowJ) {
                  await database.update(gameAssignments).set({ playerId: pidJ }).where(eq(gameAssignments.id, rowI.id));
                  await database.update(gameAssignments).set({ playerId: pidI }).where(eq(gameAssignments.id, rowJ.id));
                }

                // Update state
                dayStates[i].players = newI;
                dayStates[j].players = newJ;
                gameAssignmentState.set(dayStates[i].game.id, newI);
                gameAssignmentState.set(dayStates[j].game.id, newJ);

                const nameI = pI ? `${pI.lastName}` : `#${pidI}`;
                const nameJ = pJ ? `${pJ.lastName}` : `#${pidJ}`;
                log.push({
                  type: "info",
                  day: DAYS[dow],
                  message: `Composition swap: ${nameI} (game #${dayStates[i].game.gameNumber}) ↔ ${nameJ} (game #${dayStates[j].game.gameNumber}) — quality ${oldScore} → ${newScore}`,
                });
                swapMade = true;
              }
            }
          }
        }
      }

      // --- Under-assigned repair: DNP-unblock swaps ---
      // For players who still owe games and were available today but couldn't be placed
      // due to DNP conflicts: find a game where the DNP blocker can be swapped to another
      // same-day game, AND that game has an over-assigned same-level player who can be replaced
      // by the owed player.
      for (const p of contractedPlayers) {
        const freq = p.contractedFrequency === "2+" ? 2 : (parseInt(p.contractedFrequency) || 0);
        if (freq === 0) continue;
        const wtd = wtdDonsCounts.get(p.id) ?? 0;
        if (wtd >= freq) continue; // not under-assigned

        // Must be available today
        if (p.blockedDays.includes(dow)) continue;
        if (p.vacations.some((v) => date >= v.startDate && date <= v.endDate)) continue;
        if ((assignedDates.get(p.id) ?? new Set()).has(date)) continue;

        let repairDone = false;
        for (const gs of dayStates) {
          if (repairDone) break;
          if (gs.players.length < 4) continue;
          if (gs.players.includes(p.id)) continue;

          // Find the single DNP blocker in this game
          const blockers = gs.players.filter((pid) => {
            return p.doNotPair.includes(pid) ||
              (playerData.find((pl) => pl.id === pid)?.doNotPair.includes(p.id) ?? false);
          });
          if (blockers.length !== 1) continue;
          const blockerId = blockers[0];
          const blocker = playerData.find((pl) => pl.id === blockerId);
          if (!blocker || blocker.skillLevel !== p.skillLevel) continue;

          // Find an over-assigned same-level player in this game (not the blocker)
          // who can be replaced by p
          for (const overPid of gs.players) {
            if (overPid === blockerId) continue;
            const overPlayer = playerData.find((pl) => pl.id === overPid);
            if (!overPlayer || overPlayer.skillLevel !== p.skillLevel) continue;
            const overWtd = wtdDonsCounts.get(overPid) ?? 0;
            const overFreq = overPlayer.contractedFrequency === "2+" ? 2 : (parseInt(overPlayer.contractedFrequency) || 0);
            if (overWtd <= overFreq) continue; // not over-assigned

            // p would replace overPlayer. Check DNP: p with remaining roster (includes blocker? No — blocker is the problem)
            // Wait: if we just replace overPlayer with p, blocker is still in the game → p is still DNP-blocked.
            // We need to ALSO move the blocker out. So: swap blocker to another game, then replace overPlayer with p.
            // Actually simpler: swap the blocker with a same-level from another game, then replace overPlayer with p.

            // Find another game to absorb the blocker
            for (const otherGs of dayStates) {
              if (repairDone) break;
              if (otherGs.game.id === gs.game.id) continue;
              if (otherGs.players.length < 4) continue;

              // Find a same-level player in otherGame to swap with blocker
              for (const swapId of otherGs.players) {
                const swapPlayer = playerData.find((pl) => pl.id === swapId);
                if (!swapPlayer || swapPlayer.skillLevel !== blocker.skillLevel) continue;
                if (swapId === p.id) continue;

                // After swap: blocker goes to otherGame, swapPlayer goes to gs.game
                // Then: overPlayer removed from gs.game, p added
                const gsAfterSwap = gs.players.map((pid) => pid === blockerId ? swapId : pid);
                const gsAfterReplace = gsAfterSwap.map((pid) => pid === overPid ? p.id : pid);
                const otherAfterSwap = otherGs.players.map((pid) => pid === swapId ? blockerId : pid);

                // Validate DNP in gsAfterReplace
                let ok = true;
                for (let a = 0; a < gsAfterReplace.length && ok; a++) {
                  const pa = playerData.find((pl) => pl.id === gsAfterReplace[a]);
                  for (let b = a + 1; b < gsAfterReplace.length && ok; b++) {
                    const pb = playerData.find((pl) => pl.id === gsAfterReplace[b]);
                    if (pa?.doNotPair.includes(gsAfterReplace[b]) || pb?.doNotPair.includes(gsAfterReplace[a])) ok = false;
                  }
                }
                // Validate DNP in otherAfterSwap
                for (let a = 0; a < otherAfterSwap.length && ok; a++) {
                  const pa = playerData.find((pl) => pl.id === otherAfterSwap[a]);
                  for (let b = a + 1; b < otherAfterSwap.length && ok; b++) {
                    const pb = playerData.find((pl) => pl.id === otherAfterSwap[b]);
                    if (pa?.doNotPair.includes(otherAfterSwap[b]) || pb?.doNotPair.includes(otherAfterSwap[a])) ok = false;
                  }
                }
                if (!ok) continue;

                // Validate composition
                if (hasACViolation(gsAfterReplace) || hasACViolation(otherAfterSwap)) continue;

                // Execute: 1) swap blocker ↔ swapPlayer
                const [rowBlocker] = await database.select().from(gameAssignments)
                  .where(and(eq(gameAssignments.gameId, gs.game.id), eq(gameAssignments.playerId, blockerId)));
                const [rowSwap] = await database.select().from(gameAssignments)
                  .where(and(eq(gameAssignments.gameId, otherGs.game.id), eq(gameAssignments.playerId, swapId)));
                if (rowBlocker && rowSwap) {
                  await database.update(gameAssignments).set({ playerId: swapId }).where(eq(gameAssignments.id, rowBlocker.id));
                  await database.update(gameAssignments).set({ playerId: blockerId }).where(eq(gameAssignments.id, rowSwap.id));
                }

                // Execute: 2) replace overPlayer with p in gs.game
                const [rowOver] = await database.select().from(gameAssignments)
                  .where(and(eq(gameAssignments.gameId, gs.game.id), eq(gameAssignments.playerId, overPid)));
                if (rowOver) {
                  await database.update(gameAssignments).set({ playerId: p.id }).where(eq(gameAssignments.id, rowOver.id));
                }

                // Update state
                gs.players = gsAfterReplace;
                otherGs.players = otherAfterSwap;
                gameAssignmentState.set(gs.game.id, gsAfterReplace);
                gameAssignmentState.set(otherGs.game.id, otherAfterSwap);

                // Update counts
                wtdDonsCounts.set(p.id, (wtdDonsCounts.get(p.id) ?? 0) + 1);
                wtdDonsCounts.set(overPid, (wtdDonsCounts.get(overPid) ?? 0) - 1);
                const pDatesSet = assignedDates.get(p.id) ?? new Set();
                pDatesSet.add(date);
                assignedDates.set(p.id, pDatesSet);

                log.push({
                  type: "info",
                  day: DAYS[dow],
                  message: `DNP-unblock: ${blocker.lastName} ↔ ${swapPlayer.lastName} (game #${gs.game.gameNumber} ↔ #${otherGs.game.gameNumber}), then ${overPlayer.lastName} replaced by ${p.lastName} in #${gs.game.gameNumber}`,
                });

                repairDone = true;
                break;
              }
            }
          }
        }
      }
    }

    // --- Cross-day composition optimization ---
    // After all days are processed, try swapping players between games on DIFFERENT days
    // to improve composition quality. Each swap must validate that both players are
    // eligible to play on the other's day (availability, blocked days, consecutive days, DNP, derated).
    const allFilledGames = donsGames.filter((g) => (gameAssignmentState.get(g.id) ?? []).length === 4);
    const allDayStates = allFilledGames.map((g) => ({
      game: g,
      players: [...(gameAssignmentState.get(g.id) ?? [])],
    }));

    // Reuse groupGameIds from day-level pass — recalculate for all games
    const crossDayGroupGameIds = new Set<number>();
    for (const gs of allDayStates) {
      for (const pid of gs.players) {
        const head = playerData.find((p) => p.id === pid);
        if (!head || head.groupPct === 0 || head.groupMembers.length === 0) continue;
        const coPlayers = gs.players.filter((id) => id !== pid);
        if (coPlayers.every((id) => head.groupMembers.includes(id))) {
          crossDayGroupGameIds.add(gs.game.id);
        }
      }
    }

    let crossDaySwapMade = true;
    while (crossDaySwapMade) {
      crossDaySwapMade = false;
      for (let i = 0; i < allDayStates.length && !crossDaySwapMade; i++) {
        if (crossDayGroupGameIds.has(allDayStates[i].game.id)) continue;
        for (let j = i + 1; j < allDayStates.length && !crossDaySwapMade; j++) {
          if (crossDayGroupGameIds.has(allDayStates[j].game.id)) continue;
          // Only cross-day swaps (same-day already handled)
          if (allDayStates[i].game.date === allDayStates[j].game.date) continue;

          for (let pi = 0; pi < 4 && !crossDaySwapMade; pi++) {
            for (let pj = 0; pj < 4 && !crossDaySwapMade; pj++) {
              const pidI = allDayStates[i].players[pi];
              const pidJ = allDayStates[j].players[pj];
              if (pidI === pidJ) continue;

              // Check composition improvement first (cheap)
              const newI = [...allDayStates[i].players]; newI[pi] = pidJ;
              const newJ = [...allDayStates[j].players]; newJ[pj] = pidI;

              const oldScore = getCompositionScore(allDayStates[i].players)
                             + getCompositionScore(allDayStates[j].players);
              const newScore = getCompositionScore(newI) + getCompositionScore(newJ);
              if (newScore <= oldScore) continue;

              // Block swaps that create 1x-A + C violations
              if (hasACViolation(newI) || hasACViolation(newJ)) continue;

              const pI = playerData.find((p) => p.id === pidI);
              const pJ = playerData.find((p) => p.id === pidJ);
              if (!pI || !pJ) continue;

              const gameI = allDayStates[i].game;
              const gameJ = allDayStates[j].game;

              // --- Constraint 1: Blocked days ---
              if (pJ.blockedDays.includes(gameI.dayOfWeek)) continue;
              if (pI.blockedDays.includes(gameJ.dayOfWeek)) continue;

              // --- Constraint 1b: No early games ---
              if (pJ.noEarlyGames && gameI.startTime < "10:00") continue;
              if (pI.noEarlyGames && gameJ.startTime < "10:00") continue;

              // --- Constraint 2: Vacation ---
              if (pJ.vacations.some((v) => gameI.date >= v.startDate && gameI.date <= v.endDate)) continue;
              if (pI.vacations.some((v) => gameJ.date >= v.startDate && gameJ.date <= v.endDate)) continue;

              // --- Constraint 3: No double-booking ---
              // pidJ must not already play on gameI's date (other than gameJ which they're leaving)
              const pJDates = assignedDates.get(pidJ) ?? new Set();
              if (pJDates.has(gameI.date) && !pJDates.has(gameJ.date)) continue; // already on gameI's date via another game
              // More precise: check if pidJ plays any OTHER game on gameI's date
              const pJOtherOnDateI = allDayStates.some((gs) =>
                gs.game.id !== gameJ.id && gs.game.date === gameI.date && gs.players.includes(pidJ));
              if (pJOtherOnDateI) continue;

              const pIDates = assignedDates.get(pidI) ?? new Set();
              const pIOtherOnDateJ = allDayStates.some((gs) =>
                gs.game.id !== gameI.id && gs.game.date === gameJ.date && gs.players.includes(pidI));
              if (pIOtherOnDateJ) continue;

              // --- Constraint 4: No consecutive days ---
              if (pJ.noConsecutiveDays) {
                const dateI = new Date(gameI.date + "T12:00:00");
                const prevDay = new Date(dateI); prevDay.setDate(prevDay.getDate() - 1);
                const nextDay = new Date(dateI); nextDay.setDate(nextDay.getDate() + 1);
                // Get all dates pidJ will be assigned to after swap (remove gameJ.date, add gameI.date)
                const pJNewDates = new Set(pJDates);
                if (!allDayStates.some((gs) => gs.game.id !== gameJ.id && gs.game.date === gameJ.date && gs.players.includes(pidJ))) {
                  pJNewDates.delete(gameJ.date);
                }
                pJNewDates.add(gameI.date);
                const prevStr = prevDay.toISOString().split("T")[0];
                const nextStr = nextDay.toISOString().split("T")[0];
                if (pJNewDates.has(prevStr) || pJNewDates.has(nextStr)) continue;
              }
              if (pI.noConsecutiveDays) {
                const dateJ = new Date(gameJ.date + "T12:00:00");
                const prevDay = new Date(dateJ); prevDay.setDate(prevDay.getDate() - 1);
                const nextDay = new Date(dateJ); nextDay.setDate(nextDay.getDate() + 1);
                const pINewDates = new Set(pIDates);
                if (!allDayStates.some((gs) => gs.game.id !== gameI.id && gs.game.date === gameI.date && gs.players.includes(pidI))) {
                  pINewDates.delete(gameI.date);
                }
                pINewDates.add(gameJ.date);
                const prevStr = prevDay.toISOString().split("T")[0];
                const nextStr = nextDay.toISOString().split("T")[0];
                if (pINewDates.has(prevStr) || pINewDates.has(nextStr)) continue;
              }

              // --- Constraint 5: DNP ---
              let dnpOk = true;
              for (const otherId of newI) {
                if (otherId === pidJ) continue;
                if (pJ.doNotPair.includes(otherId)) { dnpOk = false; break; }
                const other = playerData.find((p) => p.id === otherId);
                if (other?.doNotPair.includes(pidJ)) { dnpOk = false; break; }
              }
              if (dnpOk) {
                for (const otherId of newJ) {
                  if (otherId === pidI) continue;
                  if (pI.doNotPair.includes(otherId)) { dnpOk = false; break; }
                  const other = playerData.find((p) => p.id === otherId);
                  if (other?.doNotPair.includes(pidI)) { dnpOk = false; break; }
                }
              }
              if (!dnpOk) continue;

              // --- Constraint 6: Derated pairing ---
              let deratedOk = true;
              if (maxDeratedPerWeek != null) {
                const gamesToCheck = [...donsGames.map((g) => ({
                  ...g,
                  assignments: (gameAssignmentState.get(g.id) ?? []).map((pid, idx) => ({ playerId: pid, slotPosition: idx + 1 })),
                }))];
                if (maxDeratedPerWeek === 2) {
                  gamesToCheck.push(...prevWeekGamesData.map((g) => ({
                    ...g,
                    assignments: g.assignments.map((a) => ({ playerId: a.playerId, slotPosition: a.slotPosition })),
                  })));
                }

                // Check pidJ in game i (new roster newI)
                for (const otherId of newI) {
                  if (otherId === pidJ) continue;
                  const otherPlayer = playerData.find((p) => p.id === otherId);
                  if (!otherPlayer) continue;
                  if (pJ.isDerated === otherPlayer.isDerated) continue;
                  let alreadyPaired = false;
                  for (const g of gamesToCheck) {
                    if (g.status !== "normal") continue;
                    if (g.id === gameI.id || g.id === gameJ.id) continue;
                    const inGame = g.assignments.some((a) => a.playerId === otherId);
                    if (!inGame) continue;
                    if (g.assignments.some((a) => a.playerId === pidJ)) { alreadyPaired = true; break; }
                  }
                  if (alreadyPaired) { deratedOk = false; break; }
                }
                if (deratedOk) {
                  for (const otherId of newJ) {
                    if (otherId === pidI) continue;
                    const otherPlayer = playerData.find((p) => p.id === otherId);
                    if (!otherPlayer) continue;
                    if (pI.isDerated === otherPlayer.isDerated) continue;
                    let alreadyPaired = false;
                    for (const g of gamesToCheck) {
                      if (g.status !== "normal") continue;
                      if (g.id === gameI.id || g.id === gameJ.id) continue;
                      const inGame = g.assignments.some((a) => a.playerId === otherId);
                      if (!inGame) continue;
                      if (g.assignments.some((a) => a.playerId === pidI)) { alreadyPaired = true; break; }
                    }
                    if (alreadyPaired) { deratedOk = false; break; }
                  }
                }
              }
              if (!deratedOk) continue;

              // Apply cross-day swap in DB
              const [rowI] = await database.select().from(gameAssignments)
                .where(and(eq(gameAssignments.gameId, gameI.id), eq(gameAssignments.playerId, pidI)));
              const [rowJ] = await database.select().from(gameAssignments)
                .where(and(eq(gameAssignments.gameId, gameJ.id), eq(gameAssignments.playerId, pidJ)));
              if (rowI && rowJ) {
                await database.update(gameAssignments).set({ playerId: pidJ }).where(eq(gameAssignments.id, rowI.id));
                await database.update(gameAssignments).set({ playerId: pidI }).where(eq(gameAssignments.id, rowJ.id));
              }

              // Update in-memory state
              allDayStates[i].players = newI;
              allDayStates[j].players = newJ;
              gameAssignmentState.set(gameI.id, newI);
              gameAssignmentState.set(gameJ.id, newJ);

              // Update assignedDates tracking
              // pidJ: remove gameJ.date (if no other game on that date), add gameI.date
              const pJDatesUpd = assignedDates.get(pidJ) ?? new Set();
              if (!allDayStates.some((gs) => gs.game.id !== gameJ.id && gs.game.date === gameJ.date && gs.players.includes(pidJ))) {
                pJDatesUpd.delete(gameJ.date);
              }
              pJDatesUpd.add(gameI.date);
              assignedDates.set(pidJ, pJDatesUpd);

              // pidI: remove gameI.date (if no other game on that date), add gameJ.date
              const pIDatesUpd = assignedDates.get(pidI) ?? new Set();
              if (!allDayStates.some((gs) => gs.game.id !== gameI.id && gs.game.date === gameI.date && gs.players.includes(pidI))) {
                pIDatesUpd.delete(gameI.date);
              }
              pIDatesUpd.add(gameJ.date);
              assignedDates.set(pidI, pIDatesUpd);

              const nameI = `${pI.lastName}`;
              const nameJ = `${pJ.lastName}`;
              log.push({
                type: "info",
                message: `Cross-day swap: ${nameI} (game #${gameI.gameNumber}, ${DAYS[gameI.dayOfWeek]}) ↔ ${nameJ} (game #${gameJ.gameNumber}, ${DAYS[gameJ.dayOfWeek]}) — quality ${oldScore} → ${newScore}`,
              });
              crossDaySwapMade = true;
            }
          }
        }
      }
    }

    // 9. Summary
    const totalSlots = donsGames.length * 4;
    const filled = createdAssignmentIds.length;
    const unfilled = totalSlots - filled;

    // Pass summary
    if (pass28Count > 0) {
      log.push({ type: "info", message: `Pass 2.8 (cGamesOk): ${pass28Count} slots filled by A/B players in C-player games` });
    }
    if (assignExtra && pass3Count > 0) {
      log.push({ type: "info", message: `Pass 3 (extras): ${pass3Count} slots filled by 2+ players beyond weekly minimum` });
    }
    if (assignStdCatchup && pass35Count > 0) {
      log.push({ type: "info", message: `Pass 3.5 (STD catchup): ${pass35Count} slots filled by players with season deficit` });
    }
    if (assignCSubs && pass4Count > 0) {
      log.push({ type: "info", message: `Pass 4 (subs): ${pass4Count} slots filled by substitute players` });
    }

    // Determine the highest pass used
    const lastPass = pass4Count > 0 ? "Pass 4 (subs)"
      : pass35Count > 0 ? "Pass 3.5 (STD catchup)"
      : pass3Count > 0 ? "Pass 3 (extras)"
      : pass28Count > 0 ? "Pass 2.8 (cGamesOk)"
      : "Pass 2 (base)";
    log.push({
      type: "info",
      message: `Complete: ${filled}/${totalSlots} slots filled, ${unfilled} unfilled. Last pass used: ${lastPass}.`,
    });

    // Group game summary
    for (const p of playerData) {
      if (p.groupPct > 0 && p.groupMembers.length > 0) {
        const total = groupTotalGames.get(p.id) ?? 0;
        const grp = groupGroupGames.get(p.id) ?? 0;
        const achieved = total > 0 ? Math.round((grp / total) * 100) : 0;
        log.push({
          type: "info",
          message: `${p.lastName} Group: ${grp}/${total} group games (target ${p.groupPct}%, achieved ${achieved}%)`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      assignedCount: filled,
      totalSlots,
      unfilled,
      assignmentIds: createdAssignmentIds,
      log,
    });
  } catch (err) {
    console.error("[auto-assign POST] error:", err);
    return NextResponse.json({ error: "Auto-assign failed: " + String(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/games/auto-assign
 * Body: { seasonId: number, weekNumber: number }
 * Clears all Don's game assignments for the given week.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { seasonId, weekNumber } = (await request.json()) as { seasonId: number; weekNumber: number };
    if (!seasonId || !weekNumber) {
      return NextResponse.json({ error: "seasonId and weekNumber required" }, { status: 400 });
    }

    const database = await db();

    // Find all Don's games for this week
    const weekGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.weekNumber, weekNumber)));

    const donsGameIds = weekGames
      .filter((g) => g.group === "dons" && g.status === "normal")
      .map((g) => g.id);

    if (donsGameIds.length === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    // Delete all assignments for these games
    let deletedCount = 0;
    const BATCH = 50;
    for (let i = 0; i < donsGameIds.length; i += BATCH) {
      const batch = donsGameIds.slice(i, i + BATCH);
      const result = await database.delete(gameAssignments).where(inArray(gameAssignments.gameId, batch)).returning();
      deletedCount += result.length;
    }

    return NextResponse.json({ success: true, deletedCount });
  } catch (err) {
    console.error("[auto-assign DELETE] error:", err);
    return NextResponse.json({ error: "Clear failed: " + String(err) }, { status: 500 });
  }
}
