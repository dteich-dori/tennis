import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerBlockedDays, playerVacations, playerDoNotPair } from "@/db/schema";
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
    const { seasonId, weekNumber, assignExtra, assignCSubs } = (await request.json()) as {
      seasonId: number;
      weekNumber: number;
      assignExtra?: boolean;
      assignCSubs?: boolean;
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

    // 2. Validate: all Don's slots must be empty
    const donsAssigned = donsGames.some((g) => g.assignments.length > 0);
    if (donsAssigned) {
      return NextResponse.json({
        error: "Some Don's games already have assignments. Clear them first to use Auto-Assign.",
      }, { status: 400 });
    }

    // 3. Validate: partially-assigned Solo games must be completed first
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

    if (playerIds.length > 0) {
      blockedDaysRows = await database.select().from(playerBlockedDays).where(inArray(playerBlockedDays.playerId, playerIds));
      vacationRows = await database.select().from(playerVacations).where(inArray(playerVacations.playerId, playerIds));
      dnpRows = await database.select().from(playerDoNotPair).where(inArray(playerDoNotPair.playerId, playerIds));
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

    const playerData: PlayerData[] = allPlayers.map((p) => ({
      ...p,
      blockedDays: blockedByPlayer.get(p.id) ?? [],
      vacations: vacsByPlayer.get(p.id) ?? [],
      doNotPair: dnpByPlayer.get(p.id) ?? [],
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
      if (p.contractedFrequency === "2+") continue; // 2+ already uncapped per-week
      const freq = parseInt(p.contractedFrequency) || 0;
      if (freq === 0) continue;

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
      options?: { allowExtras?: boolean; playerPool?: PlayerData[] }
    ): PlayerData[] {
      const pool = options?.playerPool ?? contractedPlayers;
      const isSubs = !!options?.playerPool; // using a custom pool means we're in subs mode
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
            if (freq - wtd <= 0) return false;
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
    const gameAssignmentState = new Map<number, number[]>();
    for (const g of donsGames) {
      gameAssignmentState.set(g.id, []);
    }

    // Priority scoring for a player
    function getPlayerPriority(p: PlayerData, game: GameData): { mustPlay: boolean; owed: number; ytdDeficit: number; playableDaysLeft: number } {
      const freq = parseInt(p.contractedFrequency) || 0;
      const wtd = wtdDonsCounts.get(p.id) ?? 0;
      const owed = freq - wtd;
      const ytd = ytdCounts.get(p.id)?.ytdDons ?? 0;
      const expectedYtd = freq * Math.min(weekNumber, contractWeeks);
      const ytdDeficit = expectedYtd - ytd;

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

      return { mustPlay, owed, ytdDeficit, playableDaysLeft: playableDates.length };
    }

    // Per-day availability report
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

        // Pre-compute game composition for A/C mixing penalty
        const gamePlayers = currentAssignedIds.map((id) => playerData.find((p) => p.id === id));
        const hasC = gamePlayers.some((p) => p?.skillLevel === "C");
        const hasA = gamePlayers.some((p) => p?.skillLevel === "A");
        const bCount = gamePlayers.filter((p) => p?.skillLevel === "B").length;
        const aCount = gamePlayers.filter((p) => p?.skillLevel === "A").length;
        const cCount = gamePlayers.filter((p) => p?.skillLevel === "C").length;

        // Soft penalty for A+C combos without sufficient B bridges (was a hard block)
        function compositionPenalty(p: PlayerData): number {
          if (p.skillLevel === "A" && !p.cGamesOk && hasC && (bCount < 2 || aCount >= 1)) return 1;
          if (p.skillLevel === "C" && hasA && (bCount < 2 || cCount >= 1)) return 1;
          return 0;
        }

        return [...players].sort((a, b) => {
          const pa = getPlayerPriority(a, game);
          const pb = getPlayerPriority(b, game);
          if (pa.mustPlay !== pb.mustPlay) return pa.mustPlay ? -1 : 1;
          // Composition: prefer players that don't create A+C violations
          const compA = compositionPenalty(a);
          const compB = compositionPenalty(b);
          if (compA !== compB) return compA - compB;
          if (pb.owed !== pa.owed) return pb.owed - pa.owed;
          // Pairing diversity: prefer candidates who've been paired LESS with current game members
          if (currentAssignedIds.length > 0) {
            const penaltyA = getPairingPenalty(a.id, currentAssignedIds);
            const penaltyB = getPairingPenalty(b.id, currentAssignedIds);
            if (penaltyA !== penaltyB) return penaltyA - penaltyB;
          }
          if (pa.playableDaysLeft !== pb.playableDaysLeft) return pa.playableDaysLeft - pb.playableDaysLeft;
          if (pb.ytdDeficit !== pa.ytdDeficit) return pb.ytdDeficit - pa.ytdDeficit;
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

          // Update YTD counts too
          const ytdEntry = ytdCounts.get(playerId) ?? { ytdDons: 0, ytdSolo: 0 };
          ytdEntry.ytdDons += 1;
          ytdCounts.set(playerId, ytdEntry);

          return true;
        } catch (err) {
          log.push({ type: "error", day: DAYS[dow], message: `Failed to assign player ${playerId} to game #${game.gameNumber}: ${err}` });
          return false;
        }
      }

      // --- Unified assignment: all games treated equally, B and C in one pool ---
      let pass3Count = 0;
      let pass4Count = 0;

      for (const game of openGames) {
        for (let slot = 1; slot <= 4; slot++) {
          const currentAssigned = gameAssignmentState.get(game.id) ?? [];

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
              if (p.contractedFrequency === "2+") return false; // 2+ handled separately
              const freq = parseInt(p.contractedFrequency) || 0;
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
          // Pass 3: extras — allow 2+ players beyond their weekly minimum of 2
          if (eligible.length === 0 && assignExtra) {
            passUsed = 3;
            eligible = getAvailablePlayers(game, currentAssigned, false, { allowExtras: true }).filter((p) => {
              if (usedOnDay.has(p.id)) return false;
              return true;
            });
          }
          // Pass 4: subs — allow substitute players to fill remaining gaps
          if (eligible.length === 0 && assignCSubs) {
            passUsed = 4;
            eligible = getAvailablePlayers(game, currentAssigned, false, { playerPool: subPlayers }).filter((p) => {
              if (usedOnDay.has(p.id)) return false;
              return true;
            });
          }

          const prioritized = sortByPriority(eligible, game);

          if (prioritized.length > 0) {
            const chosen = prioritized[0];
            if (passUsed === 2.5) {
              log.push({ type: "info", day: DAYS[dow], message: `Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} assigned as FRONT-LOAD (vacation make-up)` });
            } else if (passUsed === 3) {
              pass3Count++;
              log.push({ type: "info", day: DAYS[dow], message: `Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} assigned as EXTRA (2+ beyond weekly min)` });
            } else if (passUsed === 4) {
              pass4Count++;
              log.push({ type: "info", day: DAYS[dow], message: `Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} assigned as SUB` });
            } else if (usedOnDay.has(chosen.id)) {
              log.push({ type: "info", day: DAYS[dow], message: `Game #${game.gameNumber} slot ${slot}: ${chosen.lastName} assigned as BONUS (extra game on same day)` });
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
      }

      // Pass summary
      if (assignExtra) {
        log.push({ type: "info", message: `Pass 3 (extras): ${pass3Count} slots filled by 2+ players beyond weekly minimum` });
      }
      if (assignCSubs) {
        log.push({ type: "info", message: `Pass 4 (subs): ${pass4Count} slots filled by substitute players` });
      }

      // --- Day-level composition optimization ---
      // After filling all games on this day, try swapping players between games
      // to reduce A+C composition violations (e.g., group C players together).
      const filledDayGames = openGames.filter((g) => (gameAssignmentState.get(g.id) ?? []).length === 4);

      function hasCompositionViolation(pids: number[]): boolean {
        const levels = pids.map((id) => playerData.find((p) => p.id === id)?.skillLevel ?? "?");
        const hA = levels.includes("A");
        const hC = levels.includes("C");
        const bCnt = levels.filter((l) => l === "B").length;
        return hA && hC && bCnt < 2;
      }

      const dayStates = filledDayGames.map((g) => ({
        game: g,
        players: [...(gameAssignmentState.get(g.id) ?? [])],
      }));

      let totalViolations = dayStates.filter((gs) => hasCompositionViolation(gs.players)).length;

      if (totalViolations > 0) {
        let swapMade = true;
        while (swapMade) {
          swapMade = false;
          for (let i = 0; i < dayStates.length && !swapMade; i++) {
            for (let j = i + 1; j < dayStates.length && !swapMade; j++) {
              for (let pi = 0; pi < 4 && !swapMade; pi++) {
                for (let pj = 0; pj < 4 && !swapMade; pj++) {
                  const pidI = dayStates[i].players[pi];
                  const pidJ = dayStates[j].players[pj];
                  if (pidI === pidJ) continue;

                  // Build swapped rosters
                  const newI = [...dayStates[i].players]; newI[pi] = pidJ;
                  const newJ = [...dayStates[j].players]; newJ[pj] = pidI;

                  const oldViols = (hasCompositionViolation(dayStates[i].players) ? 1 : 0)
                                 + (hasCompositionViolation(dayStates[j].players) ? 1 : 0);
                  const newViols = (hasCompositionViolation(newI) ? 1 : 0)
                                 + (hasCompositionViolation(newJ) ? 1 : 0);

                  if (newViols >= oldViols) continue;

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
                  totalViolations = dayStates.filter((gs) => hasCompositionViolation(gs.players)).length;

                  const nameI = pI ? `${pI.lastName}` : `#${pidI}`;
                  const nameJ = pJ ? `${pJ.lastName}` : `#${pidJ}`;
                  log.push({
                    type: "info",
                    day: DAYS[dow],
                    message: `Composition swap: ${nameI} (game #${dayStates[j].game.gameNumber}) ↔ ${nameJ} (game #${dayStates[i].game.gameNumber}) — reduced A+C violations`,
                  });
                  swapMade = true;
                }
              }
            }
          }
        }
      }
    }

    // 9. Summary
    const totalSlots = donsGames.length * 4;
    const filled = createdAssignmentIds.length;
    const unfilled = totalSlots - filled;

    // Summary is conveyed via the assignedCount/totalSlots in the response
    // and by the per-slot warnings above — no need for a duplicate summary line.

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
