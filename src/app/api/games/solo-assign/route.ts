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

    // 5. Compute per-player day targets for Tue/Fri split
    // Determine which days have solo games and whether all games on a day are early
    const dayGameCounts = new Map<number, number>(); // dayOfWeek -> total normal games
    const dayHasLateGame = new Map<number, boolean>(); // dayOfWeek -> has game >= 10:00
    for (const g of allSoloGames) {
      if (g.status !== "normal") continue;
      dayGameCounts.set(g.dayOfWeek, (dayGameCounts.get(g.dayOfWeek) ?? 0) + 1);
      if (g.startTime >= "10:00") dayHasLateGame.set(g.dayOfWeek, true);
    }
    const soloDays = [...dayGameCounts.keys()].sort(); // e.g. [2, 5] for Tue, Fri

    // Per-player per-day targets
    const playerDayTargets = new Map<number, Map<number, number>>();
    for (const p of soloPlayerData) {
      const playableDays: number[] = [];
      for (const day of soloDays) {
        // Can this player play on this day?
        if (p.blockedDays.includes(day)) continue;
        // If noEarlyGames and ALL games on this day are before 10am, skip
        if (p.noEarlyGames && !dayHasLateGame.get(day)) continue;
        playableDays.push(day);
      }

      const targets = new Map<number, number>();
      if (playableDays.length === 0) {
        // Player can't play any day — they'll get 0 assignments
        log.push({
          type: "warning",
          message: `${p.firstName} ${p.lastName} is blocked on all solo days — will not be assigned.`,
        });
      } else if (playableDays.length === 1) {
        // All games go to the single playable day
        targets.set(playableDays[0], p.soloGames);
        log.push({
          type: "info",
          message: `${p.firstName} ${p.lastName}: all ${p.soloGames} games on ${DAYS[playableDays[0]]} (only playable day).`,
        });
      } else {
        // Split evenly across playable days
        const perDay = Math.floor(p.soloGames / playableDays.length);
        let remainder = p.soloGames - perDay * playableDays.length;
        for (const day of playableDays) {
          targets.set(day, perDay + (remainder > 0 ? 1 : 0));
          if (remainder > 0) remainder--;
        }
      }
      playerDayTargets.set(p.id, targets);
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

    // 6. Process all weeks
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

            // Do-not-pair with anyone already in this game
            for (const assignedId of currentAssigned) {
              if (p.doNotPair.includes(assignedId)) return false;
              const assignedPlayer = soloPlayerData.find((sp) => sp.id === assignedId);
              if (assignedPlayer?.doNotPair.includes(p.id)) return false;
            }
            return true;
          });

          // Sort by normalized deficit (higher deficit = more behind = higher priority)
          // Then by day-specific deficit as tiebreaker
          const shuffled = shuffle([...candidates]);
          const sorted = shuffled.sort((a, b) => {
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
      }
    }

    // 7. Summary with per-player breakdown
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
