import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import {
  games,
  gameAssignments,
  players,
  playerBlockedDays,
  playerVacations,
  playerDoNotPair,
  seasons,
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
 * Returns a diagnostic explaining player eligibility for a game.
 * Handles both Solo and Don's games with group-appropriate constraint logic.
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

    // Load season for totalWeeks
    const [season] = await database
      .select()
      .from(seasons)
      .where(eq(seasons.id, game.seasonId));

    // 2. Load current assignments for this game
    const currentAssignments = await database
      .select()
      .from(gameAssignments)
      .where(eq(gameAssignments.gameId, gameId))
      .orderBy(gameAssignments.slotPosition);

    const assignedPlayerIds = currentAssignments.map((a) => a.playerId);
    const filledSlots = currentAssignments.length;
    const emptySlots = 4 - filledSlots;

    if (game.group === "solo") {
      return handleSoloDiagnostic(database, game, season, currentAssignments, assignedPlayerIds, filledSlots, emptySlots);
    } else {
      return handleDonsDiagnostic(database, game, season, currentAssignments, assignedPlayerIds, filledSlots, emptySlots);
    }
  } catch (err) {
    console.error("[explain-incomplete GET] error:", err);
    return NextResponse.json(
      { error: "Failed to explain game: " + String(err) },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDonsDiagnostic(database: any, game: any, season: any, currentAssignments: any[], assignedPlayerIds: number[], filledSlots: number, emptySlots: number) {
  const BATCH = 50;

  // Load all Don's games for this week (for WTD counts)
  const allDonsGamesThisWeek = await database
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, game.seasonId),
        eq(games.group, "dons"),
        eq(games.weekNumber, game.weekNumber),
        eq(games.status, "normal")
      )
    );

  // Load all Don's normal games for the season (for STD counts)
  const allDonsGames = await database
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, game.seasonId),
        eq(games.group, "dons"),
        eq(games.status, "normal")
      )
    );

  // Load all active contracted players (non-subs)
  const allPlayers = await database
    .select()
    .from(players)
    .where(
      and(eq(players.seasonId, game.seasonId), eq(players.isActive, true))
    );

  const contractedPlayers = allPlayers.filter(
    (p: { contractedFrequency: string }) => p.contractedFrequency !== "0"
  );
  const playerIds = contractedPlayers.map((p: { id: number }) => p.id);

  // Load constraints
  let blockedDaysRows: { playerId: number; dayOfWeek: number }[] = [];
  let vacationRows: { playerId: number; startDate: string; endDate: string }[] = [];
  let dnpRows: { playerId: number; pairedPlayerId: number }[] = [];

  for (let i = 0; i < playerIds.length; i += BATCH) {
    const batch = playerIds.slice(i, i + BATCH);
    const bRows = await database.select().from(playerBlockedDays).where(inArray(playerBlockedDays.playerId, batch));
    blockedDaysRows.push(...bRows);
    const vRows = await database.select().from(playerVacations).where(inArray(playerVacations.playerId, batch));
    vacationRows.push(...vRows);
    const dRows = await database.select().from(playerDoNotPair).where(inArray(playerDoNotPair.playerId, batch));
    dnpRows.push(...dRows);
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

  // Compute WTD (week-to-date) Don's counts per player
  const weekGameIds = allDonsGamesThisWeek.map((g: { id: number }) => g.id);
  let weekAssignmentRows: { gameId: number; playerId: number }[] = [];
  for (let i = 0; i < weekGameIds.length; i += BATCH) {
    const batch = weekGameIds.slice(i, i + BATCH);
    const rows = await database
      .select({ gameId: gameAssignments.gameId, playerId: gameAssignments.playerId })
      .from(gameAssignments)
      .where(inArray(gameAssignments.gameId, batch));
    weekAssignmentRows.push(...rows);
  }

  const wtdCounts = new Map<number, number>();
  for (const a of weekAssignmentRows) {
    wtdCounts.set(a.playerId, (wtdCounts.get(a.playerId) ?? 0) + 1);
  }

  // Compute STD (season-to-date) Don's counts per player
  const allDonsGameIds = allDonsGames.map((g: { id: number }) => g.id);
  let allAssignmentRows: { gameId: number; playerId: number }[] = [];
  for (let i = 0; i < allDonsGameIds.length; i += BATCH) {
    const batch = allDonsGameIds.slice(i, i + BATCH);
    const rows = await database
      .select({ gameId: gameAssignments.gameId, playerId: gameAssignments.playerId })
      .from(gameAssignments)
      .where(inArray(gameAssignments.gameId, batch));
    allAssignmentRows.push(...rows);
  }

  const stdCounts = new Map<number, number>();
  for (const a of allAssignmentRows) {
    stdCounts.set(a.playerId, (stdCounts.get(a.playerId) ?? 0) + 1);
  }

  // Players assigned to other games on same date
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
  const sameDateGameIds = sameDateGames.map((g: { id: number }) => g.id);
  let sameDateAssignments: { gameId: number; playerId: number }[] = [];
  for (let i = 0; i < sameDateGameIds.length; i += BATCH) {
    const batch = sameDateGameIds.slice(i, i + BATCH);
    const rows = await database
      .select({ gameId: gameAssignments.gameId, playerId: gameAssignments.playerId })
      .from(gameAssignments)
      .where(inArray(gameAssignments.gameId, batch));
    sameDateAssignments.push(...rows);
  }
  const playersOnThisDate = new Set(
    sameDateAssignments.filter((a) => a.gameId !== game.id).map((a) => a.playerId)
  );

  // Adjacent days for no-consecutive-days check
  const gameDate = new Date(game.date + "T12:00:00");
  const prevDay = new Date(gameDate);
  prevDay.setDate(prevDay.getDate() - 1);
  const nextDay = new Date(gameDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const prevStr = prevDay.toISOString().split("T")[0];
  const nextStr = nextDay.toISOString().split("T")[0];

  const adjacentGames = await database
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, game.seasonId),
        eq(games.status, "normal"),
        sql`${games.date} IN (${prevStr}, ${nextStr})`
      )
    );
  const adjacentGameIds = adjacentGames.map((g: { id: number }) => g.id);
  let adjacentAssignments: { playerId: number; date: string }[] = [];
  for (let i = 0; i < adjacentGameIds.length; i += BATCH) {
    const batch = adjacentGameIds.slice(i, i + BATCH);
    const rows = await database
      .select({ gameId: gameAssignments.gameId, playerId: gameAssignments.playerId })
      .from(gameAssignments)
      .where(inArray(gameAssignments.gameId, batch));
    adjacentAssignments.push(
      ...rows.map((r: { gameId: number; playerId: number }) => ({
        playerId: r.playerId,
        date: adjacentGames.find((g: { id: number }) => g.id === r.gameId)?.date ?? "",
      }))
    );
  }
  const playersOnAdjacentDates = new Map<number, string[]>();
  for (const a of adjacentAssignments) {
    const arr = playersOnAdjacentDates.get(a.playerId) ?? [];
    arr.push(a.date);
    playersOnAdjacentDates.set(a.playerId, arr);
  }

  // A/C composition of currently assigned players
  const assignedPlayerData = assignedPlayerIds.map((id) =>
    contractedPlayers.find((p: { id: number }) => p.id === id) ?? allPlayers.find((p: { id: number }) => p.id === id)
  );
  const composition = assignedPlayerData
    .map((p: { skillLevel: string } | undefined) => p?.skillLevel ?? "?")
    .sort()
    .join("");
  const hasA = assignedPlayerData.some((p: { skillLevel: string } | undefined) => p?.skillLevel === "A");
  const hasC = assignedPlayerData.some((p: { skillLevel: string } | undefined) => p?.skillLevel === "C");
  const bCount = assignedPlayerData.filter((p: { skillLevel: string } | undefined) => p?.skillLevel === "B").length;
  const aCount = assignedPlayerData.filter((p: { skillLevel: string } | undefined) => p?.skillLevel === "A").length;
  const cCount = assignedPlayerData.filter((p: { skillLevel: string } | undefined) => p?.skillLevel === "C").length;
  const blockA = hasC && (bCount < 2 || aCount >= 1);
  const blockC = hasA && (bCount < 2 || cCount >= 1);

  // Analyze each contracted player
  interface PlayerType {
    id: number;
    firstName: string;
    lastName: string;
    contractedFrequency: string;
    skillLevel: string;
    noEarlyGames: boolean;
    noConsecutiveDays: boolean;
    isDerated: boolean;
    cGamesOk: boolean;
  }

  const totalWeeks = season?.totalWeeks ?? 36;

  const playerAnalysis = contractedPlayers.map((p: PlayerType) => {
    const reasons: string[] = [];
    let eligible = true;
    const freq = p.contractedFrequency === "2+" ? 2 : parseInt(p.contractedFrequency) || 0;
    const wtd = wtdCounts.get(p.id) ?? 0;
    const std = stdCounts.get(p.id) ?? 0;
    const expectedStd = freq * Math.min(game.weekNumber, totalWeeks);
    const stdDeficit = expectedStd - std;

    // Already assigned to this game?
    if (assignedPlayerIds.includes(p.id)) {
      return {
        name: `${p.lastName}, ${p.firstName}`,
        eligible: true,
        assigned: true,
        totalAssigned: wtd,
        target: freq,
        dayTarget: 1,
        dayActual: playersOnThisDate.has(p.id) ? 1 : 0,
        reasons: [`Assigned to this game | WTD: ${wtd}/${freq} | STD: ${std} (expected ${expectedStd}, ${stdDeficit > 0 ? "behind " + stdDeficit : stdDeficit < 0 ? "ahead " + (-stdDeficit) : "on track"})`],
      };
    }

    // Blocked day
    const blocked = blockedByPlayer.get(p.id) ?? [];
    if (blocked.includes(game.dayOfWeek)) {
      reasons.push(`Blocked on ${DAYS[game.dayOfWeek]}`);
      eligible = false;
    }

    // No early games
    if (p.noEarlyGames && game.startTime < "10:00") {
      reasons.push(`No early games — this game starts at ${game.startTime}`);
      eligible = false;
    }

    // Vacation
    const vacs = vacsByPlayer.get(p.id) ?? [];
    const onVacation = vacs.find(
      (v: { startDate: string; endDate: string }) => game.date >= v.startDate && game.date <= v.endDate
    );
    if (onVacation) {
      reasons.push(`On vacation (${onVacation.startDate} to ${onVacation.endDate})`);
      eligible = false;
    }

    // Weekly quota met
    if (wtd >= freq) {
      reasons.push(`Weekly quota met (${wtd}/${freq} games this week)`);
      eligible = false;
    }

    // 2+ cap
    if (p.contractedFrequency === "2+" && wtd >= 2) {
      reasons.push(`2+ player capped at 2 games/week (${wtd} assigned)`);
      eligible = false;
    }

    // Already playing on same date
    if (playersOnThisDate.has(p.id)) {
      reasons.push(`Already playing another game on ${game.date}`);
      eligible = false;
    }

    // No consecutive days
    if (p.noConsecutiveDays) {
      const adjDates = playersOnAdjacentDates.get(p.id) ?? [];
      const playedPrev = adjDates.includes(prevStr);
      const playedNext = adjDates.includes(nextStr);
      if (playedPrev || playedNext) {
        reasons.push(`No-consecutive-days — plays ${playedPrev ? "day before" : ""}${playedPrev && playedNext ? " and " : ""}${playedNext ? "day after" : ""}`);
        eligible = false;
      }
    }

    // A/C composition penalty (soft — deprioritized, not blocked)
    if (blockA && p.skillLevel === "A" && !p.cGamesOk) {
      reasons.push("Composition penalty: A+C without 2B buffer (deprioritized, not blocked)");
    }
    if (blockC && p.skillLevel === "C") {
      reasons.push("Composition penalty: A+C without 2B buffer (deprioritized, not blocked)");
    }

    // Do-not-pair with currently assigned players
    const dnp = dnpByPlayer.get(p.id) ?? [];
    for (const assignedId of assignedPlayerIds) {
      if (dnp.includes(assignedId)) {
        const other = contractedPlayers.find((sp: { id: number }) => sp.id === assignedId) ??
                      allPlayers.find((sp: { id: number }) => sp.id === assignedId);
        reasons.push(`Do-not-pair with ${other?.lastName ?? `#${assignedId}`}`);
        eligible = false;
      }
    }
    // Reverse DNP check
    for (const assignedId of assignedPlayerIds) {
      const revDnp = dnpByPlayer.get(assignedId) ?? [];
      if (revDnp.includes(p.id)) {
        const other = contractedPlayers.find((sp: { id: number }) => sp.id === assignedId) ??
                      allPlayers.find((sp: { id: number }) => sp.id === assignedId);
        if (!reasons.some((r) => r.includes("Do-not-pair"))) {
          reasons.push(`Do-not-pair with ${other?.lastName ?? `#${assignedId}`} (reverse)`);
          eligible = false;
        }
      }
    }

    if (eligible && reasons.length === 0) {
      reasons.push(`Eligible | WTD: ${wtd}/${freq} | STD: ${std} (expected ${expectedStd}, ${stdDeficit > 0 ? "behind " + stdDeficit : stdDeficit < 0 ? "ahead " + (-stdDeficit) : "on track"})`);
    }

    return {
      name: `${p.lastName}, ${p.firstName}`,
      eligible,
      assigned: false,
      totalAssigned: wtd,
      target: freq,
      dayTarget: 1,
      dayActual: playersOnThisDate.has(p.id) ? 1 : 0,
      reasons,
    };
  });

  // Sort: assigned first, then eligible, then ineligible
  playerAnalysis.sort((a: { assigned: boolean; eligible: boolean; name: string }, b: { assigned: boolean; eligible: boolean; name: string }) => {
    if (a.assigned && !b.assigned) return -1;
    if (!a.assigned && b.assigned) return 1;
    if (a.eligible && !b.eligible) return -1;
    if (!a.eligible && b.eligible) return 1;
    return a.name.localeCompare(b.name);
  });

  const eligibleCount = playerAnalysis.filter(
    (p: { eligible: boolean; assigned: boolean }) => p.eligible && !p.assigned
  ).length;

  return NextResponse.json({
    game: formatGame(game),
    filledSlots,
    emptySlots: 4 - filledSlots,
    composition,
    eligiblePlayersRemaining: eligibleCount,
    message:
      emptySlots > 0
        ? `${4 - filledSlots} of 4 slots are empty. ${eligibleCount} player(s) are still eligible.`
        : `All 4 slots filled. ${eligibleCount} other player(s) were eligible.`,
    playerAnalysis,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSoloDiagnostic(database: any, game: any, season: any, currentAssignments: any[], assignedPlayerIds: number[], filledSlots: number, emptySlots: number) {
  const BATCH = 50;

  if (emptySlots <= 0) {
    return NextResponse.json({
      game: formatGame(game),
      filledSlots,
      emptySlots: 0,
      message: "Game is complete — all 4 slots filled.",
      playerAnalysis: [],
    });
  }

  // 2. Load all solo games for the season (for capacity/target calculations)
  const allSoloGames = await database
    .select()
    .from(games)
    .where(and(eq(games.seasonId, game.seasonId), eq(games.group, "solo")));

  // 4. Load all active solo players with constraints
  const allPlayers = await database
    .select()
    .from(players)
    .where(
      and(eq(players.seasonId, game.seasonId), eq(players.isActive, true))
    );

  const soloPlayers = allPlayers.filter(
    (p: { soloGames: number | null }) => p.soloGames && p.soloGames > 0
  );
  const soloPlayerIds = soloPlayers.map((p: { id: number }) => p.id);

  // Load constraints
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
  const allSoloGameIds = allSoloGames.map((g: { id: number }) => g.id);
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

  // Build maps
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

  // 6. Compute day slot capacity and player day targets
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

  const playerDayTargets = new Map<number, Map<number, number>>();
  for (const p of soloPlayers) {
    const playable = playerPlayableDays.get(p.id) ?? [];
    const targets = new Map<number, number>();
    const sg = p.soloGames ?? 0;

    if (playable.length === 1) {
      targets.set(playable[0], sg);
    } else if (playable.length > 1) {
      const totalRem = playable.reduce(
        (sum: number, day: number) => sum + Math.max(0, remainingCap.get(day) ?? 0),
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

  // 7. Same-date assignments
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
  const sameDateGameIds = sameDateGames.map((g: { id: number }) => g.id);
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

  // 8. Max week for pacing
  const maxWeek = allSoloGames.reduce(
    (m: number, g: { weekNumber: number }) => Math.max(m, g.weekNumber),
    0
  );

  // 9. Analyze each solo player
  interface SoloPlayerType {
    id: number;
    firstName: string;
    lastName: string;
    soloGames: number | null;
    noEarlyGames: boolean;
  }

  const playerAnalysis = soloPlayers.map((p: SoloPlayerType) => {
    const reasons: string[] = [];
    let eligible = true;
    const sg = p.soloGames ?? 0;
    const totalAssigned = totalCounts.get(p.id) ?? 0;
    const dayTarget =
      playerDayTargets.get(p.id)?.get(game.dayOfWeek) ?? 0;
    const dayActual =
      dayCounts.get(p.id)?.get(game.dayOfWeek) ?? 0;

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

    const blocked = blockedByPlayer.get(p.id) ?? [];
    if (blocked.includes(game.dayOfWeek)) {
      reasons.push(`Blocked on ${DAYS[game.dayOfWeek]}`);
      eligible = false;
    }

    if (p.noEarlyGames && game.startTime < "10:00") {
      reasons.push(`No early games — this game starts at ${game.startTime}`);
      eligible = false;
    }

    const vacs = vacsByPlayer.get(p.id) ?? [];
    const onVacation = vacs.find(
      (v: { startDate: string; endDate: string }) => game.date >= v.startDate && game.date <= v.endDate
    );
    if (onVacation) {
      reasons.push(`On vacation (${onVacation.startDate} to ${onVacation.endDate})`);
      eligible = false;
    }

    if (totalAssigned >= sg) {
      reasons.push(`Season target reached (${totalAssigned}/${sg} games assigned)`);
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

    // Pacing
    if (sg < maxWeek) {
      const expectedByNow = (sg / maxWeek) * game.weekNumber;
      if (totalAssigned >= Math.ceil(expectedByNow) + 1) {
        reasons.push(
          `Pacing: ahead of schedule (${totalAssigned} assigned, expected ~${expectedByNow.toFixed(1)} by week ${game.weekNumber})`
        );
        eligible = false;
      }
    }

    // Do-not-pair
    const dnp = dnpByPlayer.get(p.id) ?? [];
    for (const assignedId of assignedPlayerIds) {
      if (dnp.includes(assignedId)) {
        const other = soloPlayers.find((sp: { id: number }) => sp.id === assignedId);
        reasons.push(
          `Do-not-pair with ${other?.lastName ?? `#${assignedId}`}`
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

  playerAnalysis.sort((a: { assigned: boolean; eligible: boolean; name: string }, b: { assigned: boolean; eligible: boolean; name: string }) => {
    if (a.assigned && !b.assigned) return -1;
    if (!a.assigned && b.assigned) return 1;
    if (a.eligible && !b.eligible) return -1;
    if (!a.eligible && b.eligible) return 1;
    return a.name.localeCompare(b.name);
  });

  const eligibleCount = playerAnalysis.filter(
    (p: { eligible: boolean; assigned: boolean }) => p.eligible && !p.assigned
  ).length;

  const assignedPlayerDataSolo = assignedPlayerIds.map((id: number) =>
    allPlayers.find((p: { id: number }) => p.id === id)
  );
  const composition = assignedPlayerDataSolo
    .map((p: { skillLevel: string } | undefined) => p?.skillLevel ?? "?")
    .sort()
    .join("");

  return NextResponse.json({
    game: formatGame(game),
    filledSlots,
    emptySlots,
    composition,
    eligiblePlayersRemaining: eligibleCount,
    message:
      emptySlots > 0
        ? `${emptySlots} of 4 slots are empty. ${eligibleCount} player(s) are still eligible.`
        : "Game is complete.",
    playerAnalysis,
  });
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
