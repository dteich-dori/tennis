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
 * GET /api/games/explain-incomplete?gameId=123
 * Returns a diagnostic explaining WHY an incomplete solo game has empty slots.
 * For each solo player, shows whether they were eligible and if not, why not.
 */
export async function GET(request: NextRequest) {
  try {
    const gameId = Number(request.nextUrl.searchParams.get("gameId"));
    if (!gameId) {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }

    const database = await db();

    // 1. Load the game
    const [game] = await database
      .select()
      .from(games)
      .where(eq(games.id, gameId));
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // 2. Load all solo games for the season (for capacity/target calculations)
    const allSoloGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, game.seasonId), eq(games.group, "solo")));

    // 3. Load current assignments for this game
    const currentAssignments = await database
      .select()
      .from(gameAssignments)
      .where(eq(gameAssignments.gameId, gameId))
      .orderBy(gameAssignments.slotPosition);

    const assignedPlayerIds = currentAssignments.map((a) => a.playerId);
    const filledSlots = currentAssignments.length;
    const emptySlots = 4 - filledSlots;

    if (emptySlots <= 0) {
      return NextResponse.json({
        game: formatGame(game),
        filledSlots,
        emptySlots: 0,
        message: "Game is complete — all 4 slots filled.",
        playerAnalysis: [],
      });
    }

    // 4. Load all active solo players with constraints
    const allPlayers = await database
      .select()
      .from(players)
      .where(
        and(eq(players.seasonId, game.seasonId), eq(players.isActive, true))
      );

    const soloPlayers = allPlayers.filter(
      (p) => p.soloGames && p.soloGames > 0
    );
    const soloPlayerIds = soloPlayers.map((p) => p.id);

    // Load constraints
    const BATCH = 50;
    let blockedDaysRows: { playerId: number; dayOfWeek: number }[] = [];
    let vacationRows: {
      playerId: number;
      startDate: string;
      endDate: string;
    }[] = [];
    let dnpRows: { playerId: number; pairedPlayerId: number }[] = [];

    for (let i = 0; i < soloPlayerIds.length; i += BATCH) {
      const batch = soloPlayerIds.slice(i, i + BATCH);
      const bRows = await database
        .select()
        .from(playerBlockedDays)
        .where(inArray(playerBlockedDays.playerId, batch));
      blockedDaysRows.push(...bRows);
      const vRows = await database
        .select()
        .from(playerVacations)
        .where(inArray(playerVacations.playerId, batch));
      vacationRows.push(...vRows);
      const dRows = await database
        .select()
        .from(playerDoNotPair)
        .where(inArray(playerDoNotPair.playerId, batch));
      dnpRows.push(...dRows);
    }

    const blockedByPlayer = new Map<number, number[]>();
    for (const bd of blockedDaysRows) {
      const arr = blockedByPlayer.get(bd.playerId) ?? [];
      arr.push(bd.dayOfWeek);
      blockedByPlayer.set(bd.playerId, arr);
    }
    const vacsByPlayer = new Map<
      number,
      { startDate: string; endDate: string }[]
    >();
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

    // 5. Compute current assignment counts per player (total and per-day)
    // Get all solo game assignments for the season
    const allSoloGameIds = allSoloGames.map((g) => g.id);
    let allAssignmentRows: { gameId: number; playerId: number }[] = [];
    for (let i = 0; i < allSoloGameIds.length; i += BATCH) {
      const batch = allSoloGameIds.slice(i, i + BATCH);
      const rows = await database
        .select({
          gameId: gameAssignments.gameId,
          playerId: gameAssignments.playerId,
        })
        .from(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch));
      allAssignmentRows.push(...rows);
    }

    // Build maps: player -> total count, player -> day -> count
    const totalCounts = new Map<number, number>();
    const dayCounts = new Map<number, Map<number, number>>();
    const gameIdToGame = new Map<number, (typeof allSoloGames)[0]>();
    for (const g of allSoloGames) gameIdToGame.set(g.id, g);

    for (const a of allAssignmentRows) {
      totalCounts.set(a.playerId, (totalCounts.get(a.playerId) ?? 0) + 1);
      const g = gameIdToGame.get(a.gameId);
      if (g) {
        const dayMap = dayCounts.get(a.playerId) ?? new Map<number, number>();
        dayMap.set(g.dayOfWeek, (dayMap.get(g.dayOfWeek) ?? 0) + 1);
        dayCounts.set(a.playerId, dayMap);
      }
    }

    // 6. Compute day slot capacity and player day targets (same logic as solo-assign)
    const daySlotCapacity = new Map<number, number>();
    const dayHasLateGame = new Map<number, boolean>();
    for (const g of allSoloGames) {
      if (g.status !== "normal") continue;
      daySlotCapacity.set(
        g.dayOfWeek,
        (daySlotCapacity.get(g.dayOfWeek) ?? 0) + 4
      );
      if (g.startTime >= "10:00") dayHasLateGame.set(g.dayOfWeek, true);
    }
    const soloDays = [...daySlotCapacity.keys()].sort();

    // Calculate playable days and remaining capacity for proportional targets
    const playerPlayableDays = new Map<number, number[]>();
    for (const p of soloPlayers) {
      const playable: number[] = [];
      const blocked = blockedByPlayer.get(p.id) ?? [];
      for (const day of soloDays) {
        if (blocked.includes(day)) continue;
        if (p.noEarlyGames && !dayHasLateGame.get(day)) continue;
        playable.push(day);
      }
      playerPlayableDays.set(p.id, playable);
    }

    // Compute remaining capacity after single-day players
    const remainingCap = new Map<number, number>();
    for (const day of soloDays) {
      remainingCap.set(day, daySlotCapacity.get(day) ?? 0);
    }
    for (const p of soloPlayers) {
      const playable = playerPlayableDays.get(p.id) ?? [];
      if (playable.length === 1) {
        remainingCap.set(
          playable[0],
          (remainingCap.get(playable[0]) ?? 0) - (p.soloGames ?? 0)
        );
      }
    }

    // Compute each player's day target
    const playerDayTargets = new Map<number, Map<number, number>>();
    for (const p of soloPlayers) {
      const playable = playerPlayableDays.get(p.id) ?? [];
      const targets = new Map<number, number>();
      const sg = p.soloGames ?? 0;

      if (playable.length === 1) {
        targets.set(playable[0], sg);
      } else if (playable.length > 1) {
        const totalRem = playable.reduce(
          (sum, day) => sum + Math.max(0, remainingCap.get(day) ?? 0),
          0
        );
        if (totalRem > 0) {
          let assigned = 0;
          const parts: { day: number; target: number; frac: number }[] = [];
          for (const day of playable) {
            const cap = Math.max(0, remainingCap.get(day) ?? 0);
            const frac = cap / totalRem;
            const target = Math.floor(sg * frac);
            parts.push({ day, target, frac });
            assigned += target;
          }
          let rem = sg - assigned;
          parts.sort(
            (a, b) =>
              b.frac * sg -
              Math.floor(b.frac * sg) -
              (a.frac * sg - Math.floor(a.frac * sg))
          );
          for (const dt of parts) {
            if (rem <= 0) break;
            dt.target += 1;
            rem--;
          }
          for (const dt of parts) targets.set(dt.day, dt.target);
        } else {
          const perDay = Math.floor(sg / playable.length);
          let rem = sg - perDay * playable.length;
          for (const day of playable) {
            targets.set(day, perDay + (rem > 0 ? 1 : 0));
            if (rem > 0) rem--;
          }
        }
      }
      playerDayTargets.set(p.id, targets);
    }

    // 7. Check which players are already assigned to other games on this date
    const sameDateGames = await database
      .select()
      .from(games)
      .where(
        and(
          eq(games.seasonId, game.seasonId),
          eq(games.date, game.date),
          eq(games.status, "normal")
        )
      );
    const sameDateGameIds = sameDateGames.map((g) => g.id);
    let sameDateAssignments: { gameId: number; playerId: number }[] = [];
    for (let i = 0; i < sameDateGameIds.length; i += BATCH) {
      const batch = sameDateGameIds.slice(i, i + BATCH);
      const rows = await database
        .select({
          gameId: gameAssignments.gameId,
          playerId: gameAssignments.playerId,
        })
        .from(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch));
      sameDateAssignments.push(...rows);
    }
    const playersOnThisDate = new Set(
      sameDateAssignments
        .filter((a) => a.gameId !== game.id)
        .map((a) => a.playerId)
    );

    // 8. Compute max week for pacing
    const maxWeek = allSoloGames.reduce(
      (m, g) => Math.max(m, g.weekNumber),
      0
    );

    // 9. Analyze each solo player
    const playerAnalysis = soloPlayers.map((p) => {
      const reasons: string[] = [];
      let eligible = true;
      const sg = p.soloGames ?? 0;
      const totalAssigned = totalCounts.get(p.id) ?? 0;
      const dayTarget =
        playerDayTargets.get(p.id)?.get(game.dayOfWeek) ?? 0;
      const dayActual =
        dayCounts.get(p.id)?.get(game.dayOfWeek) ?? 0;

      // Already assigned to this game?
      if (assignedPlayerIds.includes(p.id)) {
        return {
          name: `${p.lastName}, ${p.firstName}`,
          eligible: true,
          assigned: true,
          totalAssigned,
          target: sg,
          dayTarget,
          dayActual,
          reasons: ["Already assigned to this game"],
        };
      }

      // Check each constraint
      const blocked = blockedByPlayer.get(p.id) ?? [];
      if (blocked.includes(game.dayOfWeek)) {
        reasons.push(`Blocked on ${DAYS[game.dayOfWeek]}`);
        eligible = false;
      }

      if (p.noEarlyGames && game.startTime < "10:00") {
        reasons.push(
          `No early games — this game starts at ${game.startTime}`
        );
        eligible = false;
      }

      const vacs = vacsByPlayer.get(p.id) ?? [];
      const onVacation = vacs.find(
        (v) => game.date >= v.startDate && game.date <= v.endDate
      );
      if (onVacation) {
        reasons.push(
          `On vacation (${onVacation.startDate} to ${onVacation.endDate})`
        );
        eligible = false;
      }

      if (totalAssigned >= sg) {
        reasons.push(
          `Season target reached (${totalAssigned}/${sg} games assigned)`
        );
        eligible = false;
      }

      if (dayActual >= dayTarget) {
        reasons.push(
          `${DAYS[game.dayOfWeek]} target reached (${dayActual}/${dayTarget} ${DAYS[game.dayOfWeek]} games assigned)`
        );
        eligible = false;
      }

      if (playersOnThisDate.has(p.id)) {
        reasons.push(`Already playing another game on ${game.date}`);
        eligible = false;
      }

      // Pacing constraint
      if (sg < maxWeek) {
        const expectedByNow = (sg / maxWeek) * game.weekNumber;
        if (totalAssigned >= Math.ceil(expectedByNow) + 1) {
          reasons.push(
            `Pacing: ahead of schedule (${totalAssigned} assigned, expected ~${expectedByNow.toFixed(1)} by week ${game.weekNumber})`
          );
          eligible = false;
        }
      }

      // Do-not-pair with currently assigned players
      const dnp = dnpByPlayer.get(p.id) ?? [];
      for (const assignedId of assignedPlayerIds) {
        if (dnp.includes(assignedId)) {
          const other = soloPlayers.find((sp) => sp.id === assignedId);
          reasons.push(
            `Do-not-pair with ${other?.lastName ?? `#${assignedId}`} (already in this game)`
          );
          eligible = false;
        }
      }

      if (eligible && reasons.length === 0) {
        reasons.push("Eligible — no constraint prevents assignment");
      }

      return {
        name: `${p.lastName}, ${p.firstName}`,
        eligible,
        assigned: false,
        totalAssigned,
        target: sg,
        dayTarget,
        dayActual,
        reasons,
      };
    });

    // Sort: assigned first, then eligible, then ineligible
    playerAnalysis.sort((a, b) => {
      if (a.assigned && !b.assigned) return -1;
      if (!a.assigned && b.assigned) return 1;
      if (a.eligible && !b.eligible) return -1;
      if (!a.eligible && b.eligible) return 1;
      return a.name.localeCompare(b.name);
    });

    const eligibleCount = playerAnalysis.filter(
      (p) => p.eligible && !p.assigned
    ).length;

    return NextResponse.json({
      game: formatGame(game),
      filledSlots,
      emptySlots,
      eligiblePlayersRemaining: eligibleCount,
      message:
        emptySlots > 0
          ? `${emptySlots} of 4 slots are empty. ${eligibleCount} player(s) are still eligible.`
          : "Game is complete.",
      playerAnalysis,
    });
  } catch (err) {
    console.error("[explain-incomplete GET] error:", err);
    return NextResponse.json(
      { error: "Failed to explain incomplete game: " + String(err) },
      { status: 500 }
    );
  }
}

function formatGame(game: {
  gameNumber: number;
  date: string;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  group: string;
  status: string;
  weekNumber: number;
}) {
  return {
    gameNumber: game.gameNumber,
    date: game.date,
    dayOfWeek: DAYS[game.dayOfWeek],
    startTime: game.startTime,
    courtNumber: game.courtNumber,
    group: game.group,
    status: game.status,
    weekNumber: game.weekNumber,
  };
}
