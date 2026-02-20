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
import { eq, and, inArray, sql } from "drizzle-orm";

interface Violation {
  rule: string;
  severity: "error" | "warning";
  gameId: number;
  gameNumber: number;
  date: string;
  playerName: string;
  detail: string;
}

/**
 * GET /api/games/compliance?seasonId=1&weekNumber=3
 * Checks all assignments in the given week for rule violations.
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    const weekNumber = request.nextUrl.searchParams.get("weekNumber");
    const group = request.nextUrl.searchParams.get("group"); // "dons" or "solo"
    if (!seasonId || !weekNumber) {
      return NextResponse.json(
        { error: "seasonId and weekNumber required" },
        { status: 400 }
      );
    }

    const database = await db();
    const sid = parseInt(seasonId);
    const wk = parseInt(weekNumber);

    // Load season settings (for maxDeratedPerWeek)
    const seasonData = await database.select().from(seasons).where(eq(seasons.id, sid));
    const maxDeratedPerWeek = seasonData.length > 0 ? seasonData[0].maxDeratedPerWeek : null;

    // Load games for this week, filtered by group if specified
    const weekGames = group
      ? await database
          .select()
          .from(games)
          .where(and(eq(games.seasonId, sid), eq(games.weekNumber, wk), eq(games.group, group)))
      : await database
          .select()
          .from(games)
          .where(and(eq(games.seasonId, sid), eq(games.weekNumber, wk)));

    if (weekGames.length === 0) {
      return NextResponse.json({ violations: [], checked: 0 });
    }

    const gameIds = weekGames.map((g) => g.id);

    // Load all assignments for this week
    const assignments = gameIds.length > 0
      ? await database
          .select()
          .from(gameAssignments)
          .where(inArray(gameAssignments.gameId, gameIds))
      : [];

    // Get unique player IDs from assignments
    const assignedPlayerIds = [...new Set(assignments.map((a) => a.playerId))];

    // Load ALL active players for the season (needed for under-assigned check)
    const allSeasonPlayers = await database
      .select()
      .from(players)
      .where(and(eq(players.seasonId, sid), eq(players.isActive, true)));

    // Load player data for assigned players (may include inactive players)
    const assignedPlayersData = assignedPlayerIds.length > 0
      ? await database
          .select()
          .from(players)
          .where(inArray(players.id, assignedPlayerIds))
      : [];

    // Merge: all season players + any assigned players not already included
    const allPlayersMap = new Map(allSeasonPlayers.map((p) => [p.id, p]));
    for (const p of assignedPlayersData) {
      if (!allPlayersMap.has(p.id)) allPlayersMap.set(p.id, p);
    }

    const playerMap = allPlayersMap;

    // Load blocked days for assigned players
    const blockedDays = assignedPlayerIds.length > 0
      ? await database
          .select()
          .from(playerBlockedDays)
          .where(inArray(playerBlockedDays.playerId, assignedPlayerIds))
      : [];

    const blockedByPlayer = new Map<number, number[]>();
    for (const bd of blockedDays) {
      const existing = blockedByPlayer.get(bd.playerId) ?? [];
      existing.push(bd.dayOfWeek);
      blockedByPlayer.set(bd.playerId, existing);
    }

    // Load vacations for assigned players
    const vacations = assignedPlayerIds.length > 0
      ? await database
          .select()
          .from(playerVacations)
          .where(inArray(playerVacations.playerId, assignedPlayerIds))
      : [];

    const vacationsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
    for (const v of vacations) {
      const existing = vacationsByPlayer.get(v.playerId) ?? [];
      existing.push({ startDate: v.startDate, endDate: v.endDate });
      vacationsByPlayer.set(v.playerId, existing);
    }

    // Load do-not-pair rules for assigned players
    const doNotPairs = assignedPlayerIds.length > 0
      ? await database
          .select()
          .from(playerDoNotPair)
          .where(inArray(playerDoNotPair.playerId, assignedPlayerIds))
      : [];

    const doNotPairMap = new Map<number, number[]>();
    for (const dnp of doNotPairs) {
      const existing = doNotPairMap.get(dnp.playerId) ?? [];
      existing.push(dnp.pairedPlayerId);
      doNotPairMap.set(dnp.playerId, existing);
    }

    // Build game lookup
    const gameMap = new Map(weekGames.map((g) => [g.id, g]));

    // Group assignments by game
    const assignmentsByGame = new Map<number, typeof assignments>();
    for (const a of assignments) {
      const existing = assignmentsByGame.get(a.gameId) ?? [];
      existing.push(a);
      assignmentsByGame.set(a.gameId, existing);
    }

    // Group assignments by player
    const assignmentsByPlayer = new Map<number, typeof assignments>();
    for (const a of assignments) {
      const existing = assignmentsByPlayer.get(a.playerId) ?? [];
      existing.push(a);
      assignmentsByPlayer.set(a.playerId, existing);
    }

    const violations: Violation[] = [];

    const playerName = (id: number): string => {
      const p = playerMap.get(id);
      return p ? `${p.lastName}, ${p.firstName}` : `Player #${id}`;
    };

    // ===== CHECK 1: One game per day =====
    for (const [playerId, pAssignments] of assignmentsByPlayer) {
      const dateGames = new Map<string, number[]>();
      for (const a of pAssignments) {
        const g = gameMap.get(a.gameId);
        if (!g || g.status !== "normal") continue;
        const existing = dateGames.get(g.date) ?? [];
        existing.push(g.gameNumber);
        dateGames.set(g.date, existing);
      }
      for (const [date, gameNums] of dateGames) {
        if (gameNums.length > 1) {
          violations.push({
            rule: "One game per day",
            severity: "error",
            gameId: 0,
            gameNumber: gameNums[0],
            date,
            playerName: playerName(playerId),
            detail: `Assigned to ${gameNums.length} games on ${date} (games #${gameNums.join(", #")})`,
          });
        }
      }
    }

    // ===== CHECK 2: Vacation dates =====
    for (const [playerId, pAssignments] of assignmentsByPlayer) {
      const pVacations = vacationsByPlayer.get(playerId) ?? [];
      if (pVacations.length === 0) continue;
      for (const a of pAssignments) {
        const g = gameMap.get(a.gameId);
        if (!g || g.status !== "normal") continue;
        for (const v of pVacations) {
          if (g.date >= v.startDate && g.date <= v.endDate) {
            violations.push({
              rule: "Vacation conflict",
              severity: "error",
              gameId: g.id,
              gameNumber: g.gameNumber,
              date: g.date,
              playerName: playerName(playerId),
              detail: `On vacation ${v.startDate} through ${v.endDate}`,
            });
          }
        }
      }
    }

    // ===== CHECK 3: Blocked days =====
    for (const [playerId, pAssignments] of assignmentsByPlayer) {
      const pBlocked = blockedByPlayer.get(playerId) ?? [];
      if (pBlocked.length === 0) continue;
      for (const a of pAssignments) {
        const g = gameMap.get(a.gameId);
        if (!g || g.status !== "normal") continue;
        if (pBlocked.includes(g.dayOfWeek)) {
          const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          violations.push({
            rule: "Blocked day",
            severity: "error",
            gameId: g.id,
            gameNumber: g.gameNumber,
            date: g.date,
            playerName: playerName(playerId),
            detail: `${dayNames[g.dayOfWeek]} is a blocked day`,
          });
        }
      }
    }

    // ===== CHECK 4: Inactive player =====
    for (const a of assignments) {
      const p = playerMap.get(a.playerId);
      if (p && !p.isActive) {
        const g = gameMap.get(a.gameId);
        if (!g || g.status !== "normal") continue;
        violations.push({
          rule: "Inactive player",
          severity: "warning",
          gameId: g.id,
          gameNumber: g.gameNumber,
          date: g.date,
          playerName: playerName(a.playerId),
          detail: "Player is marked inactive",
        });
      }
    }

    // ===== CHECK 5: Weekly frequency exceeded (dons only) =====
    if (group !== "solo") {
      for (const [playerId, pAssignments] of assignmentsByPlayer) {
        const p = playerMap.get(playerId);
        if (!p) continue;
        const normalGames = pAssignments.filter((a) => {
          const g = gameMap.get(a.gameId);
          return g && g.status === "normal";
        });
        const freq = parseInt(p.contractedFrequency) || 0;
        if (normalGames.length > freq && freq > 0) {
          violations.push({
            rule: "Over contracted frequency",
            severity: "warning",
            gameId: 0,
            gameNumber: 0,
            date: "",
            playerName: playerName(playerId),
            detail: `Assigned ${normalGames.length} games but contracted for ${freq}/week`,
          });
        }
      }
    }

    // ===== CHECK 6: Sub assigned (informational) =====
    for (const [playerId, pAssignments] of assignmentsByPlayer) {
      const p = playerMap.get(playerId);
      if (!p) continue;
      if (p.contractedFrequency === "0") {
        const normalGames = pAssignments.filter((a) => {
          const g = gameMap.get(a.gameId);
          return g && g.status === "normal";
        });
        if (normalGames.length > 0) {
          const g = gameMap.get(normalGames[0].gameId);
          violations.push({
            rule: "Substitute assigned",
            severity: "warning",
            gameId: g?.id ?? 0,
            gameNumber: g?.gameNumber ?? 0,
            date: g?.date ?? "",
            playerName: playerName(playerId),
            detail: `Sub player assigned to ${normalGames.length} game(s)`,
          });
        }
      }
    }

    // ===== CHECK 7: Solo eligibility =====
    for (const a of assignments) {
      const g = gameMap.get(a.gameId);
      if (!g || g.status !== "normal" || g.group !== "solo") continue;
      const p = playerMap.get(a.playerId);
      if (p && !p.soloShareLevel) {
        violations.push({
          rule: "Solo eligibility",
          severity: "error",
          gameId: g.id,
          gameNumber: g.gameNumber,
          date: g.date,
          playerName: playerName(a.playerId),
          detail: "No solo share level set but assigned to a solo game",
        });
      }
    }

    // ===== CHECK 8: Duplicate player in same game =====
    for (const [gameId, gAssignments] of assignmentsByGame) {
      const g = gameMap.get(gameId);
      if (!g || g.status !== "normal") continue;
      const playerIds = gAssignments.map((a) => a.playerId);
      const seen = new Set<number>();
      for (const pid of playerIds) {
        if (seen.has(pid)) {
          violations.push({
            rule: "Duplicate in game",
            severity: "error",
            gameId: g.id,
            gameNumber: g.gameNumber,
            date: g.date,
            playerName: playerName(pid),
            detail: "Assigned to multiple slots in the same game",
          });
        }
        seen.add(pid);
      }
    }

    // ===== CHECK 9: Assignments on holiday/blanked games =====
    for (const [gameId, gAssignments] of assignmentsByGame) {
      const g = gameMap.get(gameId);
      if (!g) continue;
      if ((g.status === "holiday" || g.status === "blanked") && gAssignments.length > 0) {
        violations.push({
          rule: "Assignment on non-playable game",
          severity: "error",
          gameId: g.id,
          gameNumber: g.gameNumber,
          date: g.date,
          playerName: gAssignments.map((a) => playerName(a.playerId)).join(", "),
          detail: `${gAssignments.length} player(s) assigned to a ${g.status} game`,
        });
      }
    }

    // ===== CHECK 10: No consecutive days =====
    for (const [playerId, pAssignments] of assignmentsByPlayer) {
      const p = playerMap.get(playerId);
      if (!p || !p.noConsecutiveDays) continue;
      const gameDates = pAssignments
        .map((a) => gameMap.get(a.gameId))
        .filter((g) => g && g.status === "normal")
        .map((g) => g!.date)
        .sort();
      const uniqueDates = [...new Set(gameDates)];
      for (let i = 1; i < uniqueDates.length; i++) {
        const prev = new Date(uniqueDates[i - 1] + "T00:00:00");
        const curr = new Date(uniqueDates[i] + "T00:00:00");
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays === 1) {
          violations.push({
            rule: "Consecutive days",
            severity: "error",
            gameId: 0,
            gameNumber: 0,
            date: uniqueDates[i],
            playerName: playerName(playerId),
            detail: `Played on ${uniqueDates[i - 1]} and ${uniqueDates[i]} (consecutive days)`,
          });
        }
      }
    }

    // ===== CHECK 11: Do-not-pair (bidirectional) =====
    for (const [gameId, gAssignments] of assignmentsByGame) {
      const g = gameMap.get(gameId);
      if (!g || g.status !== "normal") continue;
      const playerIds = gAssignments.map((a) => a.playerId);
      for (let i = 0; i < playerIds.length; i++) {
        for (let j = i + 1; j < playerIds.length; j++) {
          // Check both directions: (i→j) and (j→i)
          const dnpListI = doNotPairMap.get(playerIds[i]) ?? [];
          const dnpListJ = doNotPairMap.get(playerIds[j]) ?? [];
          if (dnpListI.includes(playerIds[j]) || dnpListJ.includes(playerIds[i])) {
            violations.push({
              rule: "Do-not-pair",
              severity: "error",
              gameId: g.id,
              gameNumber: g.gameNumber,
              date: g.date,
              playerName: `${playerName(playerIds[i])} & ${playerName(playerIds[j])}`,
              detail: "These players should not be paired together",
            });
          }
        }
      }
    }

    // ===== CHECK 12: Incomplete games (fewer than 4 players) =====
    for (const g of weekGames) {
      if (g.status !== "normal") continue;
      const gAssigns = assignmentsByGame.get(g.id) ?? [];
      if (gAssigns.length < 4) {
        const empty = 4 - gAssigns.length;
        violations.push({
          rule: "Incomplete game",
          severity: "error",
          gameId: g.id,
          gameNumber: g.gameNumber,
          date: g.date,
          playerName: "-",
          detail: `${empty} open slot${empty !== 1 ? "s" : ""} (${gAssigns.length}/4 assigned)`,
        });
      }
    }

    // ===== CHECK 13: Under-assigned contract players =====
    // Count normal game assignments per player this week (already filtered by group if specified)
    const weeklyCount = new Map<number, number>();
    for (const a of assignments) {
      const g = gameMap.get(a.gameId);
      if (!g || g.status !== "normal") continue;
      weeklyCount.set(a.playerId, (weeklyCount.get(a.playerId) ?? 0) + 1);
    }

    const soloShareFreq: Record<string, number> = { full: 1, half: 0.5, quarter: 0.25, eighth: 0.125 };

    if (group === "solo") {
      // Solo: only report WTD=0 for full-share players (not partial share)
      for (const [, p] of playerMap) {
        if (!p.isActive) continue;
        if (!p.soloShareLevel) continue;
        if (p.soloShareLevel !== "full") continue; // only full-share players
        if (p.contractedFrequency === "0") continue; // skip subs
        const count = weeklyCount.get(p.id) ?? 0;
        if (count === 0) {
          violations.push({
            rule: "Under-assigned",
            severity: "warning",
            gameId: 0,
            gameNumber: 0,
            date: "",
            playerName: playerName(p.id),
            detail: `Solo: full-share player with 0 games this week`,
          });
        }
      }

      // Solo: report any YTD deficit for all solo share players
      // Compute YTD counts for solo games across the season up to this week
      const ytdSoloRows = await database
        .select({
          playerId: gameAssignments.playerId,
          count: sql<number>`count(*)`.as("count"),
        })
        .from(gameAssignments)
        .innerJoin(games, eq(gameAssignments.gameId, games.id))
        .where(
          and(
            eq(games.seasonId, sid),
            eq(games.status, "normal"),
            eq(games.group, "solo")
          )
        )
        .groupBy(gameAssignments.playerId);

      const ytdSoloCount = new Map<number, number>();
      for (const row of ytdSoloRows) {
        ytdSoloCount.set(row.playerId, row.count);
      }

      for (const [, p] of playerMap) {
        if (!p.isActive) continue;
        if (!p.soloShareLevel) continue;
        if (p.contractedFrequency === "0") continue; // skip subs
        const freq = soloShareFreq[p.soloShareLevel] ?? 0;
        if (freq === 0) continue;
        const expectedYtd = freq * wk;
        const actualYtd = ytdSoloCount.get(p.id) ?? 0;
        if (actualYtd < expectedYtd) {
          const freqLabel = freq < 1 ? `1 per ${Math.round(1 / freq)} weeks` : `${freq}/week`;
          violations.push({
            rule: "YTD deficit",
            severity: "warning",
            gameId: 0,
            gameNumber: 0,
            date: "",
            playerName: playerName(p.id),
            detail: `Solo (${freqLabel}): ${actualYtd} YTD games, expected ${expectedYtd}`,
          });
        }
      }
    } else {
      // Dons: original under-assigned logic
      const groupLabel = group === "dons" ? "Dons" : "Total";
      for (const [, p] of playerMap) {
        if (!p.isActive) continue;
        const freq = parseInt(p.contractedFrequency) || 0;
        if (freq === 0) continue; // skip subs
        const count = weeklyCount.get(p.id) ?? 0;
        if (count < freq) {
          violations.push({
            rule: "Under-assigned",
            severity: "warning",
            gameId: 0,
            gameNumber: 0,
            date: "",
            playerName: playerName(p.id),
            detail: `${groupLabel}: assigned ${count} game(s), expected ${freq}`,
          });
        }
      }
    }

    // ===== CHECK 14: Derated pairing limit (dons only) =====
    // maxDeratedPerWeek=1: same derated player at most once per week
    // maxDeratedPerWeek=2: same derated player at most once per 2 weeks
    if (maxDeratedPerWeek != null && group !== "solo") {
      // For "once per 2 weeks", also load previous week's games and assignments
      let prevWeekPairings: Map<number, Set<number>> | null = null;
      if (maxDeratedPerWeek === 2 && wk > 1) {
        const prevGames = group
          ? await database.select().from(games).where(and(eq(games.seasonId, sid), eq(games.weekNumber, wk - 1), eq(games.group, group)))
          : await database.select().from(games).where(and(eq(games.seasonId, sid), eq(games.weekNumber, wk - 1)));
        const prevGameIds = prevGames.map((g) => g.id);
        const prevAssignments = prevGameIds.length > 0
          ? await database.select().from(gameAssignments).where(inArray(gameAssignments.gameId, prevGameIds))
          : [];
        const prevGameMap = new Map(prevGames.map((g) => [g.id, g]));

        // Build map: playerId → Set of derated player IDs they were paired with last week
        prevWeekPairings = new Map<number, Set<number>>();
        const prevByGame = new Map<number, number[]>();
        for (const a of prevAssignments) {
          const g = prevGameMap.get(a.gameId);
          if (!g || g.status !== "normal") continue;
          const arr = prevByGame.get(a.gameId) ?? [];
          arr.push(a.playerId);
          prevByGame.set(a.gameId, arr);
        }
        for (const [, playerIds] of prevByGame) {
          for (const pid of playerIds) {
            const pp = playerMap.get(pid);
            if (!pp || pp.isDerated) continue;
            for (const otherId of playerIds) {
              if (otherId === pid) continue;
              const other = playerMap.get(otherId);
              if (other?.isDerated) {
                const set = prevWeekPairings.get(pid) ?? new Set<number>();
                set.add(otherId);
                prevWeekPairings.set(pid, set);
              }
            }
          }
        }
      }

      // For each non-derated player, track which specific derated players they're paired with
      for (const [playerId, pAssignments] of assignmentsByPlayer) {
        const p = playerMap.get(playerId);
        if (!p || p.isDerated) continue;

        // Count pairings with each specific derated player this week
        const deratedPairingCount = new Map<number, number>();
        for (const a of pAssignments) {
          const g = gameMap.get(a.gameId);
          if (!g || g.status !== "normal") continue;
          const gAssigns = assignmentsByGame.get(a.gameId) ?? [];
          for (const ga of gAssigns) {
            if (ga.playerId === playerId) continue;
            const coPlayer = playerMap.get(ga.playerId);
            if (coPlayer?.isDerated) {
              deratedPairingCount.set(ga.playerId, (deratedPairingCount.get(ga.playerId) ?? 0) + 1);
            }
          }
        }

        if (maxDeratedPerWeek === 1) {
          // "Once per week": flag if paired with same derated player more than once this week
          for (const [deratedId, count] of deratedPairingCount) {
            if (count > 1) {
              violations.push({
                rule: "Derated pairing limit",
                severity: "warning",
                gameId: 0,
                gameNumber: 0,
                date: "",
                playerName: playerName(playerId),
                detail: `Paired with ${playerName(deratedId)} ${count} times this week (limit: once per week)`,
              });
            }
          }
        } else if (maxDeratedPerWeek === 2) {
          // "Once per 2 weeks": flag if paired this week AND also paired last week with same derated player
          const prevPairings = prevWeekPairings?.get(playerId);
          for (const [deratedId, count] of deratedPairingCount) {
            if (count > 1) {
              // Paired multiple times this week alone
              violations.push({
                rule: "Derated pairing limit",
                severity: "warning",
                gameId: 0,
                gameNumber: 0,
                date: "",
                playerName: playerName(playerId),
                detail: `Paired with ${playerName(deratedId)} ${count} times this week (limit: once per 2 weeks)`,
              });
            } else if (prevPairings?.has(deratedId)) {
              // Paired once this week but also paired last week
              violations.push({
                rule: "Derated pairing limit",
                severity: "warning",
                gameId: 0,
                gameNumber: 0,
                date: "",
                playerName: playerName(playerId),
                detail: `Paired with ${playerName(deratedId)} this week and last week (limit: once per 2 weeks)`,
              });
            }
          }
        }
      }
    }

    // Sort: errors first, then by date, then game number
    violations.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.gameNumber - b.gameNumber;
    });

    return NextResponse.json({
      violations,
      checked: assignments.length,
    });
  } catch (err) {
    console.error("[games/compliance GET] error:", err);
    return NextResponse.json(
      { error: "Failed to run compliance check" },
      { status: 500 }
    );
  }
}
