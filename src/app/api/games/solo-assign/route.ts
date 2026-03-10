import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import {
  games,
  gameAssignments,
  players,
  playerBlockedDays,
  playerVacations,
  playerDoNotPair,
} from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// Types
interface SoloPlayerData {
  id: number;
  firstName: string;
  lastName: string;
  soloGames: number; // 1-36 target games per season
  noEarlyGames: boolean;
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
}

interface LogEntry {
  type: "info" | "warning" | "error";
  week?: number;
  message: string;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * POST /api/games/solo-assign
 * Body: { seasonId: number }
 * Auto-assigns all solo game slots for all weeks in the season.
 */
export async function POST(request: NextRequest) {
  try {
    const { seasonId } = (await request.json()) as { seasonId: number };

    if (!seasonId) {
      return NextResponse.json(
        { error: "seasonId is required" },
        { status: 400 }
      );
    }

    const database = await db();
    const log: LogEntry[] = [];

    // 1. Load ALL solo games for the season
    const allSoloGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.group, "solo")));

    if (allSoloGames.length === 0) {
      return NextResponse.json(
        { error: "No solo games found for this season. Generate games first." },
        { status: 400 }
      );
    }

    // 2. Check that no solo assignments exist yet
    const soloGameIds = allSoloGames.map((g) => g.id);
    const BATCH = 50;
    let existingAssignments = 0;
    for (let i = 0; i < soloGameIds.length; i += BATCH) {
      const batch = soloGameIds.slice(i, i + BATCH);
      const rows = await database
        .select({ count: sql<number>`count(*)`.as("count") })
        .from(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch));
      existingAssignments += rows[0]?.count ?? 0;
    }
    if (existingAssignments > 0) {
      return NextResponse.json(
        {
          error:
            "Solo games already have assignments. Clear them first to use Auto-Assign.",
        },
        { status: 400 }
      );
    }

    // 3. Load all active solo players with constraints
    const allPlayers = await database
      .select()
      .from(players)
      .where(and(eq(players.seasonId, seasonId), eq(players.isActive, true)));

    const soloPlayers = allPlayers.filter((p) => p.soloGames && p.soloGames > 0);
    const playerIds = soloPlayers.map((p) => p.id);

    if (soloPlayers.length === 0) {
      return NextResponse.json(
        { error: "No active players with solo games found." },
        { status: 400 }
      );
    }

    // Load constraints
    let blockedDaysRows: { playerId: number; dayOfWeek: number }[] = [];
    let vacationRows: { playerId: number; startDate: string; endDate: string }[] = [];
    let dnpRows: { playerId: number; pairedPlayerId: number }[] = [];

    if (playerIds.length > 0) {
      blockedDaysRows = await database
        .select()
        .from(playerBlockedDays)
        .where(inArray(playerBlockedDays.playerId, playerIds));
      vacationRows = await database
        .select()
        .from(playerVacations)
        .where(inArray(playerVacations.playerId, playerIds));
      dnpRows = await database
        .select()
        .from(playerDoNotPair)
        .where(inArray(playerDoNotPair.playerId, playerIds));
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

    const soloPlayerData: SoloPlayerData[] = soloPlayers.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      soloGames: p.soloGames!,
      noEarlyGames: p.noEarlyGames,
      blockedDays: blockedByPlayer.get(p.id) ?? [],
      vacations: vacsByPlayer.get(p.id) ?? [],
      doNotPair: dnpByPlayer.get(p.id) ?? [],
    }));

    const totalTargetGames = soloPlayerData.reduce((s, p) => s + p.soloGames, 0);
    log.push({
      type: "info",
      message: `Solo players: ${soloPlayerData.length} players, total target games: ${totalTargetGames} (${(totalTargetGames / 36).toFixed(1)} shares).`,
    });
    for (const p of soloPlayerData) {
      log.push({
        type: "info",
        message: `  ${p.firstName} ${p.lastName}: ${p.soloGames} games`,
      });
    }

    // 4. Group games by week
    const gamesByWeek = new Map<number, GameData[]>();
    for (const g of allSoloGames) {
      const arr = gamesByWeek.get(g.weekNumber) ?? [];
      arr.push(g);
      gamesByWeek.set(g.weekNumber, arr);
    }
    const maxWeek = allSoloGames.reduce((m, g) => Math.max(m, g.weekNumber), 0);

    // 5. Compute per-player day targets — proportional to remaining day capacity
    // Determine which days have solo games and whether all games on a day are early
    const dayGameCounts = new Map<number, number>(); // dayOfWeek -> total normal games
    const daySlotCapacity = new Map<number, number>(); // dayOfWeek -> total slots (games × 4)
    const dayHasLateGame = new Map<number, boolean>(); // dayOfWeek -> has game >= 10:00
    for (const g of allSoloGames) {
      if (g.status !== "normal") continue;
      dayGameCounts.set(g.dayOfWeek, (dayGameCounts.get(g.dayOfWeek) ?? 0) + 1);
      daySlotCapacity.set(g.dayOfWeek, (daySlotCapacity.get(g.dayOfWeek) ?? 0) + 4);
      if (g.startTime >= "10:00") dayHasLateGame.set(g.dayOfWeek, true);
    }
    const soloDays = [...dayGameCounts.keys()].sort(); // e.g. [2, 3] for Tue, Wed

    // Determine each player's playable days
    const playerPlayableDays = new Map<number, number[]>();
    for (const p of soloPlayerData) {
      const playableDays: number[] = [];
      for (const day of soloDays) {
        if (p.blockedDays.includes(day)) continue;
        if (p.noEarlyGames && !dayHasLateGame.get(day)) continue;
        playableDays.push(day);
      }
      playerPlayableDays.set(p.id, playableDays);
    }

    // Two-pass day target allocation:
    // Pass 1: Commit single-day players and subtract from day capacity
    const remainingCapacity = new Map<number, number>();
    for (const day of soloDays) {
      remainingCapacity.set(day, daySlotCapacity.get(day) ?? 0);
    }

    const singleDayPlayers: SoloPlayerData[] = [];
    const multiDayPlayers: SoloPlayerData[] = [];

    for (const p of soloPlayerData) {
      const playableDays = playerPlayableDays.get(p.id) ?? [];
      if (playableDays.length === 0) {
        // handled below
      } else if (playableDays.length === 1) {
        singleDayPlayers.push(p);
        const day = playableDays[0];
        remainingCapacity.set(day, (remainingCapacity.get(day) ?? 0) - p.soloGames);
      } else {
        multiDayPlayers.push(p);
      }
    }

    // Log capacity info
    for (const day of soloDays) {
      const total = daySlotCapacity.get(day) ?? 0;
      const remaining = remainingCapacity.get(day) ?? 0;
      const committed = total - remaining;
      log.push({
        type: "info",
        message: `${DAYS[day]}: ${total} total slots, ${committed} committed to single-day players, ${remaining} remaining.`,
      });
    }

    // Pass 2: Allocate multi-day players proportionally to remaining capacity
    const playerDayTargets = new Map<number, Map<number, number>>();

    // Track how many slots have been allocated to multi-day players per day
    const multiDayAllocated = new Map<number, number>();
    for (const day of soloDays) multiDayAllocated.set(day, 0);

    for (const p of soloPlayerData) {
      const playableDays = playerPlayableDays.get(p.id) ?? [];
      const targets = new Map<number, number>();

      if (playableDays.length === 0) {
        log.push({
          type: "warning",
          message: `${p.firstName} ${p.lastName} is blocked on all solo days — will not be assigned.`,
        });
      } else if (playableDays.length === 1) {
        targets.set(playableDays[0], p.soloGames);
        log.push({
          type: "info",
          message: `${p.firstName} ${p.lastName}: all ${p.soloGames} games on ${DAYS[playableDays[0]]} (only playable day).`,
        });
      } else {
        // Split proportionally to remaining capacity across playable days
        const totalRemaining = playableDays.reduce(
          (sum, day) => sum + Math.max(0, remainingCapacity.get(day) ?? 0),
          0
        );

        if (totalRemaining > 0) {
          let assigned = 0;
          const dayTargetsList: { day: number; target: number; frac: number }[] = [];

          for (const day of playableDays) {
            const cap = Math.max(0, remainingCapacity.get(day) ?? 0);
            const frac = cap / totalRemaining;
            const target = Math.floor(p.soloGames * frac);
            dayTargetsList.push({ day, target, frac });
            assigned += target;
          }

          // Distribute remainder to the day(s) with the largest fractional parts
          let remainder = p.soloGames - assigned;
          dayTargetsList.sort(
            (a, b) =>
              (b.frac * p.soloGames - Math.floor(b.frac * p.soloGames)) -
              (a.frac * p.soloGames - Math.floor(a.frac * p.soloGames))
          );
          for (const dt of dayTargetsList) {
            if (remainder <= 0) break;
            dt.target += 1;
            remainder--;
          }

          for (const dt of dayTargetsList) {
            targets.set(dt.day, dt.target);
          }
        } else {
          // Fallback: split evenly if no capacity info
          const perDay = Math.floor(p.soloGames / playableDays.length);
          let rem = p.soloGames - perDay * playableDays.length;
          for (const day of playableDays) {
            targets.set(day, perDay + (rem > 0 ? 1 : 0));
            if (rem > 0) rem--;
          }
        }

        const dayBreakdown = playableDays
          .map((d) => `${DAYS[d].slice(0, 3)}=${targets.get(d) ?? 0}`)
          .join(", ");
        log.push({
          type: "info",
          message: `${p.firstName} ${p.lastName}: ${p.soloGames} games split proportionally (${dayBreakdown}).`,
        });
      }
      playerDayTargets.set(p.id, targets);
    }

    // Global rebalancing: ensure sum of per-day targets matches day capacity
    // Rounding errors can accumulate, leaving some days short and others over
    for (const day of soloDays) {
      const capacity = daySlotCapacity.get(day) ?? 0;
      let dayTotal = 0;
      for (const p of soloPlayerData) {
        dayTotal += playerDayTargets.get(p.id)?.get(day) ?? 0;
      }
      const deficit = capacity - dayTotal;
      if (deficit > 0) {
        // Need to shift `deficit` games TO this day FROM other days
        // Find multi-day players who can take +1 on this day and -1 on another
        const candidates = multiDayPlayers
          .map((p) => {
            const targets = playerDayTargets.get(p.id)!;
            const currentOnDay = targets.get(day) ?? 0;
            // Find a donor day (another playable day with target > 0)
            const playable = playerPlayableDays.get(p.id) ?? [];
            let bestDonor = -1;
            let bestSurplus = -Infinity;
            for (const otherDay of playable) {
              if (otherDay === day) continue;
              const otherTarget = targets.get(otherDay) ?? 0;
              if (otherTarget <= 0) continue;
              const otherCapacity = daySlotCapacity.get(otherDay) ?? 0;
              let otherDayTotal = 0;
              for (const pp of soloPlayerData) {
                otherDayTotal += playerDayTargets.get(pp.id)?.get(otherDay) ?? 0;
              }
              const surplus = otherDayTotal - otherCapacity;
              if (surplus > bestSurplus) {
                bestSurplus = surplus;
                bestDonor = otherDay;
              }
            }
            // Fractional remainder = how close this player was to getting +1 on this day
            const frac = (p.soloGames * ((remainingCapacity.get(day) ?? 0) / (playable.reduce(
              (s, d) => s + Math.max(0, remainingCapacity.get(d) ?? 0), 0
            ) || 1))) - currentOnDay;
            return { player: p, donorDay: bestDonor, frac };
          })
          .filter((c) => c.donorDay >= 0)
          .sort((a, b) => b.frac - a.frac);

        let remaining = deficit;
        for (const c of candidates) {
          if (remaining <= 0) break;
          const targets = playerDayTargets.get(c.player.id)!;
          targets.set(day, (targets.get(day) ?? 0) + 1);
          targets.set(c.donorDay, (targets.get(c.donorDay) ?? 0) - 1);
          remaining--;
          log.push({
            type: "info",
            message: `Rebalance: ${c.player.lastName} +1 ${DAYS[day].slice(0, 3)}, -1 ${DAYS[c.donorDay].slice(0, 3)}.`,
          });
        }
      }
    }

    // Log final day target totals
    for (const day of soloDays) {
      let dayTotal = 0;
      for (const p of soloPlayerData) {
        dayTotal += playerDayTargets.get(p.id)?.get(day) ?? 0;
      }
      const capacity = daySlotCapacity.get(day) ?? 0;
      log.push({
        type: dayTotal === capacity ? "info" : "warning",
        message: `${DAYS[day]} final targets: ${dayTotal}/${capacity} slots.`,
      });
    }

    // Track running assignment counts
    const assignmentCounts = new Map<number, number>(); // total per player
    const dayAssignmentCounts = new Map<number, Map<number, number>>(); // player -> day -> count
    const playerDatesAssigned = new Map<number, Set<string>>(); // one-game-per-date

    let totalAssigned = 0;
    let totalSlots = 0;

    // Seeded random for reproducible but varied assignments
    let rngState = seasonId * 2654435761;
    function nextRandom(): number {
      rngState = (rngState ^ (rngState << 13)) & 0xffffffff;
      rngState = (rngState ^ (rngState >> 17)) & 0xffffffff;
      rngState = (rngState ^ (rngState << 5)) & 0xffffffff;
      return (rngState >>> 0) / 4294967296;
    }

    function shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(nextRandom() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    // 6. Compute remaining games per day (for capacity reservation)
    const remainingDayGames = new Map<number, number>(); // dayOfWeek -> games remaining
    for (const g of allSoloGames) {
      if (g.status !== "normal") continue;
      remainingDayGames.set(g.dayOfWeek, (remainingDayGames.get(g.dayOfWeek) ?? 0) + 1);
    }

    // 7. Process all weeks
    for (let week = 1; week <= maxWeek; week++) {
      const weekGames = (gamesByWeek.get(week) ?? [])
        .filter((g) => g.status === "normal")
        .sort((a, b) => {
          if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
          if (a.startTime !== b.startTime)
            return a.startTime.localeCompare(b.startTime);
          return a.courtNumber - b.courtNumber;
        });

      if (weekGames.length === 0) continue;

      totalSlots += weekGames.length * 4;

      // All solo players are eligible (no pair alternation)
      const eligibleThisWeek = soloPlayerData;

      // Track assignments within each game (for do-not-pair)
      const gameAssignmentState = new Map<number, number[]>();
      for (const g of weekGames) {
        gameAssignmentState.set(g.id, []);
      }

      // Assign each game
      for (const game of weekGames) {
        for (let slot = 1; slot <= 4; slot++) {
          const currentAssigned = gameAssignmentState.get(game.id) ?? [];

          // Filter candidates
          const candidates = eligibleThisWeek.filter((p) => {
            if (currentAssigned.includes(p.id)) return false;
            const dates = playerDatesAssigned.get(p.id);
            if (dates?.has(game.date)) return false;
            if (p.blockedDays.includes(game.dayOfWeek)) return false;
            if (p.noEarlyGames && game.startTime < "10:00") return false;
            if (p.vacations.some((v) => game.date >= v.startDate && game.date <= v.endDate)) return false;

            // Check day target: don't exceed this player's target for this day
            const dayTarget = playerDayTargets.get(p.id)?.get(game.dayOfWeek) ?? 0;
            const dayActual = dayAssignmentCounts.get(p.id)?.get(game.dayOfWeek) ?? 0;
            if (dayActual >= dayTarget) return false;

            // Also don't exceed total target
            const totalActual = assignmentCounts.get(p.id) ?? 0;
            if (totalActual >= p.soloGames) return false;

            // Even distribution: for partial-share players (< 36 games),
            // don't assign if already ahead of expected pace for this week.
            // This spreads their games across the entire season.
            if (p.soloGames < maxWeek) {
              const expectedByNow = (p.soloGames / maxWeek) * week;
              if (totalActual >= Math.ceil(expectedByNow) + 1) return false;
            }

            // Capacity reservation: if assigning this player would complete their
            // day quota, check that enough OTHER players still have capacity
            // for future games on this day. Each game needs 4 players.
            // Skip this check for single-day players — they have no alternative
            // day, so deferring them just loses them a game permanently.
            const playableDays = playerPlayableDays.get(p.id) ?? [];
            if (playableDays.length > 1 && dayActual + 1 >= dayTarget) {
              const futureGamesOnDay = (remainingDayGames.get(game.dayOfWeek) ?? 1) - 1; // exclude current game
              if (futureGamesOnDay > 0) {
                // Count other players who still have capacity on this day (excluding this player)
                let othersWithCapacity = 0;
                for (const other of soloPlayerData) {
                  if (other.id === p.id) continue;
                  const otherDayTarget = playerDayTargets.get(other.id)?.get(game.dayOfWeek) ?? 0;
                  const otherDayActual = dayAssignmentCounts.get(other.id)?.get(game.dayOfWeek) ?? 0;
                  if (otherDayActual < otherDayTarget) othersWithCapacity++;
                }
                // Need at least 4 players per game; if pool drops to 3 or fewer, defer
                if (othersWithCapacity < 4) return false;
              }
            }

            // Do-not-pair with anyone already in this game
            for (const assignedId of currentAssigned) {
              if (p.doNotPair.includes(assignedId)) return false;
              const assignedPlayer = soloPlayerData.find((sp) => sp.id === assignedId);
              if (assignedPlayer?.doNotPair.includes(p.id)) return false;
            }
            return true;
          });

          // Sort candidates by priority:
          // 1. Single-day players first — they can ONLY play on this day,
          //    so they must get priority (e.g., Miller needs 36/37 Tuesdays)
          // 2. Normalized overall deficit — players most behind schedule
          // 3. Day-specific deficit as tiebreaker
          const shuffled = shuffle([...candidates]);
          const sorted = shuffled.sort((a, b) => {
            // Single-day players get top priority — no alternative day
            const aPlayable = playerPlayableDays.get(a.id)?.length ?? 1;
            const bPlayable = playerPlayableDays.get(b.id)?.length ?? 1;
            if (aPlayable !== bPlayable) {
              return aPlayable - bPlayable; // fewer playable days = higher priority
            }

            const aExpected = (a.soloGames / maxWeek) * week;
            const bExpected = (b.soloGames / maxWeek) * week;
            const aActual = assignmentCounts.get(a.id) ?? 0;
            const bActual = assignmentCounts.get(b.id) ?? 0;
            const aDeficit = aExpected - aActual;
            const bDeficit = bExpected - bActual;
            // Normalize so players with different targets compete fairly
            const aNormalized = (aDeficit * 36) / a.soloGames;
            const bNormalized = (bDeficit * 36) / b.soloGames;
            if (Math.abs(bNormalized - aNormalized) > 0.01) {
              return bNormalized - aNormalized;
            }

            // Tiebreaker: prefer the player most behind on THIS day
            const aDayTarget = playerDayTargets.get(a.id)?.get(game.dayOfWeek) ?? 0;
            const bDayTarget = playerDayTargets.get(b.id)?.get(game.dayOfWeek) ?? 0;
            const aDayActual = dayAssignmentCounts.get(a.id)?.get(game.dayOfWeek) ?? 0;
            const bDayActual = dayAssignmentCounts.get(b.id)?.get(game.dayOfWeek) ?? 0;
            const aDayRatio = aDayTarget > 0 ? aDayActual / aDayTarget : 1;
            const bDayRatio = bDayTarget > 0 ? bDayActual / bDayTarget : 1;
            return aDayRatio - bDayRatio; // lower ratio = more behind = higher priority
          });

          if (sorted.length > 0) {
            const chosen = sorted[0];

            await database.insert(gameAssignments).values({
              gameId: game.id,
              slotPosition: slot,
              playerId: chosen.id,
              isPrefill: false,
            });

            // Update tracking
            currentAssigned.push(chosen.id);
            gameAssignmentState.set(game.id, currentAssigned);
            assignmentCounts.set(chosen.id, (assignmentCounts.get(chosen.id) ?? 0) + 1);
            const dayMap = dayAssignmentCounts.get(chosen.id) ?? new Map<number, number>();
            dayMap.set(game.dayOfWeek, (dayMap.get(game.dayOfWeek) ?? 0) + 1);
            dayAssignmentCounts.set(chosen.id, dayMap);
            const dates = playerDatesAssigned.get(chosen.id) ?? new Set();
            dates.add(game.date);
            playerDatesAssigned.set(chosen.id, dates);
            totalAssigned++;
          } else {
            log.push({
              type: "warning",
              week,
              message: `Game #${game.gameNumber} (${DAYS[game.dayOfWeek]} ${game.date}) slot ${slot}: no eligible solo player available.`,
            });
          }
        }
        // Update remaining games count for this day (game is now processed)
        remainingDayGames.set(game.dayOfWeek, (remainingDayGames.get(game.dayOfWeek) ?? 1) - 1);
      }
    }

    // 8. Second pass: fill remaining unfilled slots with relaxed constraints
    // The greedy first pass may leave a few end-of-season slots empty because
    // all players hit their day targets. Allow slight over-allocation (+1 on day
    // target and +1 on total) to complete incomplete games.
    const unfilledAfterFirstPass = totalSlots - totalAssigned;
    if (unfilledAfterFirstPass > 0) {
      log.push({
        type: "info",
        message: `First pass: ${unfilledAfterFirstPass} unfilled slot(s). Running relaxed second pass...`,
      });

      // Find all games with empty slots
      for (let week = 1; week <= maxWeek; week++) {
        const weekGames = (gamesByWeek.get(week) ?? [])
          .filter((g) => g.status === "normal")
          .sort((a, b) => {
            if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
            if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
            return a.courtNumber - b.courtNumber;
          });

        for (const game of weekGames) {
          // Check how many slots this game currently has
          const BATCH2 = 50;
          let existingCount = 0;
          const existingPlayers: number[] = [];
          const rows = await database
            .select()
            .from(gameAssignments)
            .where(eq(gameAssignments.gameId, game.id));
          existingCount = rows.length;
          for (const r of rows) existingPlayers.push(r.playerId);

          if (existingCount >= 4) continue; // already full

          for (let slot = existingCount + 1; slot <= 4; slot++) {
            // Relaxed candidate filter: skip day target check, allow total +1
            const candidates = soloPlayerData.filter((p) => {
              if (existingPlayers.includes(p.id)) return false;
              const dates = playerDatesAssigned.get(p.id);
              if (dates?.has(game.date)) return false;
              if (p.blockedDays.includes(game.dayOfWeek)) return false;
              if (p.noEarlyGames && game.startTime < "10:00") return false;
              if (p.vacations.some((v) => game.date >= v.startDate && game.date <= v.endDate)) return false;

              // Allow total to go 1 over target (relaxed)
              const totalActual = assignmentCounts.get(p.id) ?? 0;
              if (totalActual > p.soloGames) return false;

              // Do-not-pair
              for (const assignedId of existingPlayers) {
                if (p.doNotPair.includes(assignedId)) return false;
                const assignedPlayer = soloPlayerData.find((sp) => sp.id === assignedId);
                if (assignedPlayer?.doNotPair.includes(p.id)) return false;
              }
              return true;
            });

            // Sort: prefer players still UNDER target, then by overall deficit
            const sorted = candidates.sort((a, b) => {
              const aActual = assignmentCounts.get(a.id) ?? 0;
              const bActual = assignmentCounts.get(b.id) ?? 0;
              const aUnder = aActual < a.soloGames ? 1 : 0;
              const bUnder = bActual < b.soloGames ? 1 : 0;
              if (aUnder !== bUnder) return bUnder - aUnder; // prefer under-target
              const aDeficit = a.soloGames - aActual;
              const bDeficit = b.soloGames - bActual;
              return bDeficit - aDeficit;
            });

            if (sorted.length > 0) {
              const chosen = sorted[0];
              await database.insert(gameAssignments).values({
                gameId: game.id,
                slotPosition: slot,
                playerId: chosen.id,
                isPrefill: false,
              });

              existingPlayers.push(chosen.id);
              assignmentCounts.set(chosen.id, (assignmentCounts.get(chosen.id) ?? 0) + 1);
              const dayMap = dayAssignmentCounts.get(chosen.id) ?? new Map<number, number>();
              dayMap.set(game.dayOfWeek, (dayMap.get(game.dayOfWeek) ?? 0) + 1);
              dayAssignmentCounts.set(chosen.id, dayMap);
              const dates = playerDatesAssigned.get(chosen.id) ?? new Set();
              dates.add(game.date);
              playerDatesAssigned.set(chosen.id, dates);
              totalAssigned++;

              log.push({
                type: "info",
                message: `Second pass: ${chosen.lastName} assigned to Game #${game.gameNumber} slot ${slot} (relaxed constraints).`,
              });
            }
          }
        }
      }
    }

    // 9. Summary with per-player breakdown
    const unfilled = totalSlots - totalAssigned;
    if (unfilled > 0) {
      log.push({
        type: "warning",
        message: `${unfilled} of ${totalSlots} solo slots could not be filled.`,
      });
    } else {
      log.push({
        type: "info",
        message: `All ${totalSlots} solo slots filled successfully.`,
      });
    }

    // Per-player assignment summary
    for (const p of soloPlayerData) {
      const total = assignmentCounts.get(p.id) ?? 0;
      const dayMap = dayAssignmentCounts.get(p.id) ?? new Map<number, number>();
      const dayBreakdown = soloDays
        .map((d) => `${DAYS[d].slice(0, 3)}=${dayMap.get(d) ?? 0}`)
        .join(", ");
      const status = total === p.soloGames ? "✓" : total < p.soloGames ? "⚠ under" : "⚠ over";
      log.push({
        type: total === p.soloGames ? "info" : "warning",
        message: `${p.lastName}: ${total}/${p.soloGames} assigned (${dayBreakdown}) ${status}`,
      });
    }

    return NextResponse.json({
      success: true,
      assignedCount: totalAssigned,
      totalSlots,
      unfilled,
      log,
    });
  } catch (err) {
    console.error("[solo-assign POST] error:", err);
    return NextResponse.json(
      { error: "Solo auto-assign failed: " + String(err) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/games/solo-assign
 * Body: { seasonId: number }
 * Clears all solo game assignments for the entire season.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { seasonId } = (await request.json()) as { seasonId: number };
    if (!seasonId) {
      return NextResponse.json(
        { error: "seasonId is required" },
        { status: 400 }
      );
    }

    const database = await db();

    // Find all solo games for this season
    const soloGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.group, "solo")));

    const soloGameIds = soloGames.map((g) => g.id);

    if (soloGameIds.length === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    // Delete all assignments for solo games in batches
    let deletedCount = 0;
    const BATCH = 50;
    for (let i = 0; i < soloGameIds.length; i += BATCH) {
      const batch = soloGameIds.slice(i, i + BATCH);
      const result = await database
        .delete(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch))
        .returning();
      deletedCount += result.length;
    }

    return NextResponse.json({ success: true, deletedCount });
  } catch (err) {
    console.error("[solo-assign DELETE] error:", err);
    return NextResponse.json(
      { error: "Clear solo assignments failed: " + String(err) },
      { status: 500 }
    );
  }
}
