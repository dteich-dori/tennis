import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import {
  games,
  gameAssignments,
  players,
  playerBlockedDays,
  playerVacations,
  playerDoNotPair,
  playerSoloPairs,
} from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// Types
interface SoloPlayerData {
  id: number;
  firstName: string;
  lastName: string;
  soloShareLevel: string; // "full" or "half"
  blockedDays: number[];
  vacations: { startDate: string; endDate: string }[];
  doNotPair: number[];
  soloPairId: number | null;
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

    const soloPlayers = allPlayers.filter((p) => p.soloShareLevel);
    const playerIds = soloPlayers.map((p) => p.id);

    if (soloPlayers.length === 0) {
      return NextResponse.json(
        { error: "No active players with solo share levels found." },
        { status: 400 }
      );
    }

    // Load constraints
    let blockedDaysRows: { playerId: number; dayOfWeek: number }[] = [];
    let vacationRows: { playerId: number; startDate: string; endDate: string }[] = [];
    let dnpRows: { playerId: number; pairedPlayerId: number }[] = [];
    let soloPairRows: { playerId: number; pairedPlayerId: number }[] = [];

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
      soloPairRows = await database
        .select()
        .from(playerSoloPairs)
        .where(inArray(playerSoloPairs.playerId, playerIds));
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
    const soloPairMap = new Map<number, number>();
    for (const sp of soloPairRows) {
      soloPairMap.set(sp.playerId, sp.pairedPlayerId);
    }

    const soloPlayerData: SoloPlayerData[] = soloPlayers.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      soloShareLevel: p.soloShareLevel!,
      blockedDays: blockedByPlayer.get(p.id) ?? [],
      vacations: vacsByPlayer.get(p.id) ?? [],
      doNotPair: dnpByPlayer.get(p.id) ?? [],
      soloPairId: soloPairMap.get(p.id) ?? null,
    }));

    // 4. Validate half-share pairings
    const halfSharePlayers = soloPlayerData.filter(
      (p) => p.soloShareLevel === "half"
    );
    const unpairedHalf = halfSharePlayers.filter((p) => !p.soloPairId);
    for (const p of unpairedHalf) {
      log.push({
        type: "warning",
        message: `${p.firstName} ${p.lastName} is half-share but has no pair partner — skipped.`,
      });
    }

    const fullSharePlayers = soloPlayerData.filter(
      (p) => p.soloShareLevel === "full"
    );
    const pairedHalfPlayers = halfSharePlayers.filter((p) => p.soloPairId);

    // Build unique half-share pairs (avoid processing both A->B and B->A)
    const halfPairs: { playerA: SoloPlayerData; playerB: SoloPlayerData }[] = [];
    const processedPairIds = new Set<string>();
    for (const p of pairedHalfPlayers) {
      const pairKey = [Math.min(p.id, p.soloPairId!), Math.max(p.id, p.soloPairId!)].join("-");
      if (processedPairIds.has(pairKey)) continue;
      processedPairIds.add(pairKey);
      const partner = soloPlayerData.find((sp) => sp.id === p.soloPairId);
      if (!partner) continue;
      // Lower ID = Player A (odd weeks), Higher ID = Player B (even weeks)
      const [playerA, playerB] =
        p.id < partner.id ? [p, partner] : [partner, p];
      halfPairs.push({ playerA, playerB });
    }

    log.push({
      type: "info",
      message: `Solo players: ${fullSharePlayers.length} full-share, ${halfPairs.length} half-share pairs, ${unpairedHalf.length} unpaired half-share.`,
    });

    // 5. Group games by week
    const gamesByWeek = new Map<number, GameData[]>();
    for (const g of allSoloGames) {
      const arr = gamesByWeek.get(g.weekNumber) ?? [];
      arr.push(g);
      gamesByWeek.set(g.weekNumber, arr);
    }

    // Track running assignment counts per player (for deficit calculation)
    const assignmentCounts = new Map<number, number>();
    // Track which players are assigned on which dates (for one-game-per-day)
    const playerDatesAssigned = new Map<number, Set<string>>();

    let totalAssigned = 0;
    let totalSlots = 0;

    // Seeded random for reproducible but varied assignments
    // Use seasonId as seed so re-running gives the same result
    let rngState = seasonId * 2654435761;
    function nextRandom(): number {
      rngState = (rngState ^ (rngState << 13)) & 0xffffffff;
      rngState = (rngState ^ (rngState >> 17)) & 0xffffffff;
      rngState = (rngState ^ (rngState << 5)) & 0xffffffff;
      return (rngState >>> 0) / 4294967296;
    }

    // Shuffle array in-place using Fisher-Yates
    function shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(nextRandom() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    // 6. Process all weeks (derive max from actual games)
    const maxWeek = allSoloGames.reduce((m, g) => Math.max(m, g.weekNumber), 0);
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

      // Build eligible pool for this week
      const eligibleThisWeek: SoloPlayerData[] = [];

      // Full-share: always eligible
      for (const p of fullSharePlayers) {
        eligibleThisWeek.push(p);
      }

      // Half-share pairs: determine who is designated this week
      const isOddWeek = week % 2 === 1;
      for (const { playerA, playerB } of halfPairs) {
        const designated = isOddWeek ? playerA : playerB;
        const fallback = isOddWeek ? playerB : playerA;

        // Check if designated can play ANY game this week
        const designatedCanPlayAny = weekGames.some((g) => {
          if (designated.blockedDays.includes(g.dayOfWeek)) return false;
          if (
            designated.vacations.some(
              (v) => g.date >= v.startDate && g.date <= v.endDate
            )
          )
            return false;
          return true;
        });

        if (designatedCanPlayAny) {
          eligibleThisWeek.push(designated);
        } else {
          // Fallback to partner
          const fallbackCanPlayAny = weekGames.some((g) => {
            if (fallback.blockedDays.includes(g.dayOfWeek)) return false;
            if (
              fallback.vacations.some(
                (v) => g.date >= v.startDate && g.date <= v.endDate
              )
            )
              return false;
            return true;
          });

          if (fallbackCanPlayAny) {
            eligibleThisWeek.push(fallback);
            log.push({
              type: "info",
              week,
              message: `${designated.lastName} unavailable week ${week} — ${fallback.lastName} plays instead.`,
            });
          } else {
            log.push({
              type: "warning",
              week,
              message: `Both ${playerA.lastName} and ${playerB.lastName} are blocked/on vacation in week ${week} — pair skipped.`,
            });
          }
        }
      }

      // Track assignments for this game (for do-not-pair checks within a game)
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
            // Already in this game
            if (currentAssigned.includes(p.id)) return false;

            // Already assigned to another game on this date
            const dates = playerDatesAssigned.get(p.id);
            if (dates?.has(game.date)) return false;

            // Blocked day
            if (p.blockedDays.includes(game.dayOfWeek)) return false;

            // On vacation
            if (
              p.vacations.some(
                (v) => game.date >= v.startDate && game.date <= v.endDate
              )
            )
              return false;

            // Do-not-pair with anyone already in this game (bidirectional)
            for (const assignedId of currentAssigned) {
              if (p.doNotPair.includes(assignedId)) return false;
              const assignedPlayer = soloPlayerData.find(
                (sp) => sp.id === assignedId
              );
              if (assignedPlayer?.doNotPair.includes(p.id)) return false;
            }

            return true;
          });

          // Shuffle first, then stable-sort by normalized deficit so
          // half-share and full-share players compete on equal footing.
          // Without normalization, full-share players always have larger
          // absolute deficits and win tiebreakers, starving half-share players.
          const shuffled = shuffle([...candidates]);
          const sorted = shuffled.sort((a, b) => {
            const aFreq = a.soloShareLevel === "full" ? 1.0 : 0.5;
            const bFreq = b.soloShareLevel === "full" ? 1.0 : 0.5;
            const aExpected = aFreq * week;
            const bExpected = bFreq * week;
            const aActual = assignmentCounts.get(a.id) ?? 0;
            const bActual = assignmentCounts.get(b.id) ?? 0;
            const aDeficit = aExpected - aActual;
            const bDeficit = bExpected - bActual;
            // Normalize by frequency: missing 1 of 18 (half) is proportionally
            // worse than missing 1 of 36 (full), so half-share gets priority
            const aNormalized = aDeficit / aFreq;
            const bNormalized = bDeficit / bFreq;
            return bNormalized - aNormalized;
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
            assignmentCounts.set(
              chosen.id,
              (assignmentCounts.get(chosen.id) ?? 0) + 1
            );
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

    // 7. Summary
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
