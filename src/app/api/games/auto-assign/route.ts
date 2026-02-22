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
  soloShareLevel: string | null;
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
    const { seasonId, weekNumber } = (await request.json()) as {
      seasonId: number;
      weekNumber: number;
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

    // 3. Validate: all Solo games must be fully assigned
    const unfilledSolo = soloGames.filter((g) => g.assignments.length < 4);
    if (unfilledSolo.length > 0) {
      return NextResponse.json({
        error: `All Solo games must be fully assigned first. ${unfilledSolo.length} Solo game(s) still have open slots.`,
        log: [{ type: "error", message: `${unfilledSolo.length} Solo game(s) not fully assigned: games #${unfilledSolo.map((g) => g.gameNumber).join(", #")}` }],
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
    const [seasonRow] = await database.select().from(games).where(and(eq(games.seasonId, seasonId), eq(games.weekNumber, 1)));
    const seasonData = await database.select().from(games).where(eq(games.seasonId, seasonId));
    // Get the actual season record for maxDeratedPerWeek
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
    function getAvailablePlayers(game: GameData, currentAssignments: number[]): PlayerData[] {
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

      return contractedPlayers.filter((p) => {
        if (assignedInGame.has(p.id)) return false;
        if (assignedOnDate.has(p.id)) return false;

        // Only assign players who deserve games: 2+ always eligible, others only if WTD owed > 0
        if (p.contractedFrequency !== "2+") {
          const freq = parseInt(p.contractedFrequency) || 0;
          const wtd = wtdDonsCounts.get(p.id) ?? 0;
          if (freq - wtd <= 0) return false;
        }

        // Blocked day
        if (p.blockedDays.includes(game.dayOfWeek)) return false;

        // Vacation
        if (p.vacations.some((v) => game.date >= v.startDate && game.date <= v.endDate)) return false;

        // Do-not-pair with anyone already in this game
        if (p.doNotPair.length) {
          for (const assignedId of assignedInGame) {
            if (p.doNotPair.includes(assignedId)) return false;
          }
        }
        // Reverse DNP check
        for (const assignedId of assignedInGame) {
          const assignedPlayer = contractedPlayers.find((pl) => pl.id === assignedId);
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
            const assignedPlayer = contractedPlayers.find((pl) => pl.id === assignedId);
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
      const expectedYtd = freq * weekNumber;
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
        // Only count players who deserve games
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
    // Strategy: process tightest days first (fewest surplus players) so 2+ players
    // are reserved for days that need them most, leaving easier days for non-2+ players.
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
      const soloOnDate = soloAssignedByDate.get(date) ?? new Set();

      // Get all players available on this date (not yet assigned on this date)
      // Only include players who deserve a game: 2+ contract, or WTD owed > 0
      // YTD owed only affects priority, not eligibility beyond weekly contract
      const dayPool = contractedPlayers.filter((p) => {
        if (soloOnDate.has(p.id)) return false;
        const pDates = assignedDates.get(p.id) ?? new Set();
        if (pDates.has(date)) return false;
        if (p.blockedDays.includes(dow)) return false;
        if (p.vacations.some((v) => date >= v.startDate && date <= v.endDate)) return false;
        // Only assign players who deserve games
        if (p.contractedFrequency === "2+") return true; // always eligible for extras
        const freq = parseInt(p.contractedFrequency) || 0;
        const wtd = wtdDonsCounts.get(p.id) ?? 0;
        if (freq - wtd > 0) return true; // still owe games this week
        return false;
      });

      // Separate C players and A/B players for skill-level grouping
      const cPlayers = dayPool.filter((p) => p.skillLevel === "C");
      const abPlayers = dayPool.filter((p) => p.skillLevel === "A" || p.skillLevel === "B");

      // Determine how many C-only games we can form (need 4 C players per game)
      // Then 2B+2C mixed games, then remaining are A/B games
      const numGames = dateGames.length;

      // Sort C players by priority (owed desc)
      const sortByPriority = (players: PlayerData[], game: GameData) => {
        return [...players].sort((a, b) => {
          const pa = getPlayerPriority(a, game);
          const pb = getPlayerPriority(b, game);
          if (pa.mustPlay !== pb.mustPlay) return pa.mustPlay ? -1 : 1;
          if (pb.owed !== pa.owed) return pb.owed - pa.owed;
          // Fewer playable days left = higher priority (don't miss their chance)
          if (pa.playableDaysLeft !== pb.playableDaysLeft) return pa.playableDaysLeft - pb.playableDaysLeft;
          if (pb.ytdDeficit !== pa.ytdDeficit) return pb.ytdDeficit - pa.ytdDeficit;
          return a.lastName.localeCompare(b.lastName);
        });
      };

      // Plan the day: figure out game compositions
      // Count C players who need games this week (WTD owed > 0)
      const cOwing = cPlayers.filter((p) => {
        const freq = parseInt(p.contractedFrequency) || 0;
        const wtd = wtdDonsCounts.get(p.id) ?? 0;
        return freq - wtd > 0;
      });
      const bPlayers = abPlayers.filter((p) => p.skillLevel === "B");

      // How many full C games can we make? (4 C players each)
      const fullCGames = Math.min(Math.floor(cOwing.length / 4), numGames);
      // Remaining C players after full C games
      const remainingC = cOwing.length - fullCGames * 4;
      // Mixed games: pairs of 2C + 2B (need remaining C in pairs)
      const pairedMixedGames = Math.min(Math.floor(remainingC / 2), Math.floor(bPlayers.length / 2), numGames - fullCGames);
      // If there's still an odd C player left who owes, give them their own mixed game (1C + 3B)
      const unpairedC = remainingC - pairedMixedGames * 2;
      const extraMixedGames = (unpairedC > 0 && (numGames - fullCGames - pairedMixedGames) > 0) ? Math.min(unpairedC, numGames - fullCGames - pairedMixedGames) : 0;
      const mixedGames = pairedMixedGames + extraMixedGames;
      // Rest are A/B games
      const abGames = numGames - fullCGames - mixedGames;

      // Assign games in order: C games first, then mixed, then A/B
      let gameIdx = 0;

      // Track used players on this day
      const usedOnDay = new Set<number>();

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

      // --- C-only games ---
      for (let i = 0; i < fullCGames && gameIdx < dateGames.length; i++, gameIdx++) {
        const game = dateGames[gameIdx];
        const available = getAvailablePlayers(game, []).filter(
          (p) => p.skillLevel === "C" && !usedOnDay.has(p.id)
        );
        const sorted = sortByPriority(available, game);

        for (let slot = 1; slot <= 4; slot++) {
          // Re-filter after each assignment (DNP etc. may change)
          const currentAssigned = gameAssignmentState.get(game.id) ?? [];
          const eligible = getAvailablePlayers(game, currentAssigned).filter(
            (p) => p.skillLevel === "C" && !usedOnDay.has(p.id)
          );
          const prioritized = sortByPriority(eligible, game);

          if (prioritized.length > 0) {
            await assignPlayer(game, prioritized[0].id, slot);
          } else {
            log.push({
              type: "warning",
              day: DAYS[dow],
              message: `Game #${game.gameNumber} slot ${slot}: no eligible C player available`,
            });
          }
        }
      }

      // --- Mixed games (2C+2B paired, then 1C+3B for remaining odd C players) ---
      for (let i = 0; i < mixedGames && gameIdx < dateGames.length; i++, gameIdx++) {
        const game = dateGames[gameIdx];
        const isPairedMixed = i < pairedMixedGames; // First pairedMixedGames are 2C+2B, rest are 1C+3B

        // Assign C players first (2 for paired, 1 for unpaired)
        const cSlotsNeeded = isPairedMixed ? 2 : 1;
        for (let slot = 1; slot <= cSlotsNeeded; slot++) {
          const currentAssigned = gameAssignmentState.get(game.id) ?? [];
          const eligible = getAvailablePlayers(game, currentAssigned).filter(
            (p) => p.skillLevel === "C" && !usedOnDay.has(p.id)
          );
          const prioritized = sortByPriority(eligible, game);
          if (prioritized.length > 0) {
            await assignPlayer(game, prioritized[0].id, slot);
          } else {
            log.push({ type: "warning", day: DAYS[dow], message: `Game #${game.gameNumber} slot ${slot}: no eligible C player for mixed game` });
          }
        }

        // Then fill remaining slots with B players (prefer B, fall back to A/B)
        for (let slot = cSlotsNeeded + 1; slot <= 4; slot++) {
          const currentAssigned = gameAssignmentState.get(game.id) ?? [];
          const eligible = getAvailablePlayers(game, currentAssigned).filter(
            (p) => p.skillLevel === "B" && !usedOnDay.has(p.id)
          );
          const prioritized = sortByPriority(eligible, game);
          if (prioritized.length > 0) {
            await assignPlayer(game, prioritized[0].id, slot);
          } else {
            // Fall back to any A/B player (but NOT A for mixed games with C players)
            const currentPlayerIds = gameAssignmentState.get(game.id) ?? [];
            const hasC = currentPlayerIds.some((id) => contractedPlayers.find((p) => p.id === id)?.skillLevel === "C");
            const fallback = getAvailablePlayers(game, currentAssigned).filter(
              (p) => {
                if (usedOnDay.has(p.id)) return false;
                if (hasC && p.skillLevel === "A") return false; // Can't pair A with C
                return p.skillLevel === "A" || p.skillLevel === "B";
              }
            );
            const fbSorted = sortByPriority(fallback, game);
            if (fbSorted.length > 0) {
              await assignPlayer(game, fbSorted[0].id, slot);
            } else {
              log.push({ type: "warning", day: DAYS[dow], message: `Game #${game.gameNumber} slot ${slot}: no eligible B/A player for mixed game` });
            }
          }
        }
      }

      // --- A/B games ---
      for (; gameIdx < dateGames.length; gameIdx++) {
        const game = dateGames[gameIdx];

        for (let slot = 1; slot <= 4; slot++) {
          const currentAssigned = gameAssignmentState.get(game.id) ?? [];
          // For A/B games, prefer A/B players but allow any non-C if needed
          const eligible = getAvailablePlayers(game, currentAssigned).filter(
            (p) => !usedOnDay.has(p.id)
          );

          // Prefer A/B players, then fall back to C if they can play with current group
          const abEligible = eligible.filter((p) => p.skillLevel === "A" || p.skillLevel === "B");
          const prioritized = sortByPriority(abEligible.length > 0 ? abEligible : eligible, game);

          if (prioritized.length > 0) {
            const chosen = prioritized[0];
            // If choosing a C player for an A/B game, log a warning
            if (chosen.skillLevel === "C") {
              const currentPlayers = currentAssigned.map((id) => contractedPlayers.find((p) => p.id === id));
              const hasA = currentPlayers.some((p) => p?.skillLevel === "A");
              if (hasA) {
                // C can't play with A — skip this player
                const nonC = prioritized.filter((p) => p.skillLevel !== "C");
                if (nonC.length > 0) {
                  await assignPlayer(game, nonC[0].id, slot);
                } else {
                  log.push({ type: "warning", day: DAYS[dow], message: `Game #${game.gameNumber} slot ${slot}: only C players available but game has A players — slot left empty` });
                }
                continue;
              }
            }
            await assignPlayer(game, chosen.id, slot);
          } else {
            log.push({
              type: "warning",
              day: DAYS[dow],
              message: `Game #${game.gameNumber} slot ${slot}: no eligible player available — slot left empty`,
            });
          }
        }
      }
    }

    // 9. Summary
    const totalSlots = donsGames.length * 4;
    const filled = createdAssignmentIds.length;
    const unfilled = totalSlots - filled;

    if (unfilled > 0) {
      log.push({ type: "warning", message: `${unfilled} of ${totalSlots} Don's slots could not be filled.` });
    } else {
      log.push({ type: "info", message: `All ${totalSlots} Don's slots filled successfully.` });
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
