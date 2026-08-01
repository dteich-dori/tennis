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
import { and, eq, inArray } from "drizzle-orm";

/**
 * GET /api/reports/c-slot-diagnosis?seasonId=N
 *
 * For every incomplete Don's game in the season that either
 *   (a) has ≥1 C player already assigned, or
 *   (b) has an empty slot AND is on a day/week where a C player could
 *       reach it (potentially could have been a C game),
 * walks every cGamesOk A/B player and records which rule would block
 * that candidate from filling an empty slot.
 *
 * The rule ladder each candidate is checked against (first hit wins).
 * v1.237: rules 5-6 rewritten to match what auto-assign actually
 * enforces today — the season floor (minACPerNonCGamesOk) and the
 * configurable weekly caps (maxCGamesPerWeek/maxCGamesPerWeek1x) were
 * retired; only each player's own cGamesLimit (null = Unlimited) and a
 * flat 1-per-week cap apply now, regardless of contract frequency.
 *   1. Not active OR excluded from auto-assign (baseline)
 *   2. Blocked-day (blockedDays includes game.dayOfWeek)
 *   3. On vacation covering game.date
 *   4. Already playing another game on the same date
 *   5. Season C-game cap (per-player cGamesLimit) already reached
 *   6. Weekly C-game cap (hard 1-per-week, always enforced)
 *   7. AACC composition trajectory blocked (game state can't reach AACC
 *      with this candidate — e.g., a B is already assigned)
 *   8. Do-not-pair conflict with someone already in this game
 *   9. Otherwise: ELIGIBLE — could have been auto-assigned but wasn't
 *      (usually because a higher-priority player took the slot or the
 *      Pass 3 gate held it for a different reason).
 *
 * Response:
 * {
 *   season: { id, startDate, endDate },
 *   candidatePool: {
 *     total: number,               // total cGamesOk active A/B players
 *     byContract: { "2+": n, "2": n, "1+": n, "1": n },
 *   },
 *   summary: {
 *     totalIncomplete: number,
 *     cAdjacentIncomplete: number,
 *     totalEmptySlots: number,
 *     topBlockers: [{ rule: "seasonACapReached", count: N }, ...]  // ordered desc
 *   },
 *   games: [
 *     {
 *       gameNumber, weekNumber, date, dayOfWeek, court, startTime,
 *       currentAssignments: [{ playerId, name, skill, contract, slot }],
 *       emptySlots: number,
 *       cCount: number,               // C's currently in the game
 *       compositionState: "AAAC" | "AAC" | "AC" | "..." (etc),
 *       candidates: [
 *         { playerId, name, skill, contract, ruling: "blockedDay" | "eligible" | ..., detail: string? }
 *       ]
 *     }
 *   ]
 * }
 */

const RULES = [
  "notEligible", "blockedDay", "onVacation", "playedSameDate",
  "seasonACapReached", "weeklyCCapReached", "compositionBlocked",
  "doNotPair", "eligible",
] as const;
type Rule = typeof RULES[number];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DiagnosticGameRow {
  gameNumber: number;
  weekNumber: number;
  date: string;
  dayOfWeek: number;
  dayLabel: string;
  court: number;
  startTime: string;
  currentAssignments: { playerId: number; name: string; skill: string; contract: string; slot: number }[];
  emptySlots: number;
  cCount: number;
  compositionState: string;
  candidates: {
    playerId: number;
    name: string;
    skill: string;
    contract: string;
    cGamesLimit: number | null;
    ruling: Rule;
    detail?: string;
  }[];
}

export async function GET(request: NextRequest) {
  try {
    const seasonIdParam = request.nextUrl.searchParams.get("seasonId");
    if (!seasonIdParam) return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    const seasonId = parseInt(seasonIdParam);
    const database = await db();

    const [season] = await database.select().from(seasons).where(eq(seasons.id, seasonId));
    if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 });

    // Load Don's games (normal status) for this season
    const donsGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.group, "dons"), eq(games.status, "normal")));
    const gameIds = donsGames.map((g) => g.id);
    const allAssignments = gameIds.length > 0
      ? await database.select().from(gameAssignments).where(inArray(gameAssignments.gameId, gameIds))
      : [];

    // Active, include-in-auto-assign players
    const allPlayers = await database
      .select()
      .from(players)
      .where(and(eq(players.seasonId, seasonId), eq(players.isActive, true), eq(players.excludedFromAutoAssign, false)));
    const playerById = new Map(allPlayers.map((p) => [p.id, p]));

    // Load blocked-days, vacations, DNP for all players
    const playerIds = allPlayers.map((p) => p.id);
    const [blockedRows, vacRows, dnpRows] = await Promise.all([
      playerIds.length > 0 ? database.select().from(playerBlockedDays).where(inArray(playerBlockedDays.playerId, playerIds)) : [],
      playerIds.length > 0 ? database.select().from(playerVacations).where(inArray(playerVacations.playerId, playerIds)) : [],
      playerIds.length > 0 ? database.select().from(playerDoNotPair).where(inArray(playerDoNotPair.playerId, playerIds)) : [],
    ]);
    const blockedByPlayer = new Map<number, number[]>();
    for (const b of blockedRows) {
      const arr = blockedByPlayer.get(b.playerId) ?? [];
      arr.push(b.dayOfWeek);
      blockedByPlayer.set(b.playerId, arr);
    }
    const vacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
    for (const v of vacRows) {
      const arr = vacsByPlayer.get(v.playerId) ?? [];
      arr.push({ startDate: v.startDate, endDate: v.endDate });
      vacsByPlayer.set(v.playerId, arr);
    }
    const dnpByPlayer = new Map<number, number[]>();
    for (const d of dnpRows) {
      const arr = dnpByPlayer.get(d.playerId) ?? [];
      arr.push(d.pairedPlayerId);
      dnpByPlayer.set(d.playerId, arr);
    }

    // Group assignments per game and per player
    const assignmentsByGame = new Map<number, typeof allAssignments>();
    for (const a of allAssignments) {
      const arr = assignmentsByGame.get(a.gameId) ?? [];
      arr.push(a);
      assignmentsByGame.set(a.gameId, arr);
    }
    // Per-player date -> set (for played-same-date)
    const datesPlayedByPlayer = new Map<number, Set<string>>();
    // Season C-adjacent game count per player — mirrors auto-assign's
    // acGameCounts: any game containing a C counts against a non-C
    // player's cGamesLimit, not just games that also contain an A.
    const seasonACountByPlayer = new Map<number, number>();
    // Weekly C-game count per player: key `${playerId}|${weekNumber}`
    const weeklyCCountByKey = new Map<string, number>();
    for (const a of allAssignments) {
      const g = donsGames.find((x) => x.id === a.gameId);
      if (!g) continue;
      const dates = datesPlayedByPlayer.get(a.playerId) ?? new Set<string>();
      dates.add(g.date);
      datesPlayedByPlayer.set(a.playerId, dates);
      const idsInGame = allAssignments.filter((x) => x.gameId === a.gameId).map((x) => x.playerId);
      const levels = idsInGame.map((id) => playerById.get(id)?.skillLevel ?? "?");
      const hasC = levels.includes("C");
      const p = playerById.get(a.playerId);
      if (p?.cGamesOk && p.skillLevel !== "C" && hasC) {
        seasonACountByPlayer.set(a.playerId, (seasonACountByPlayer.get(a.playerId) ?? 0) + 1);
        const key = `${a.playerId}|${g.weekNumber}`;
        weeklyCCountByKey.set(key, (weeklyCCountByKey.get(key) ?? 0) + 1);
      }
    }

    // The cGamesOk A/B candidate pool (only these can EVER be in a C game)
    const candidatePool = allPlayers.filter((p) => p.cGamesOk && p.skillLevel !== "C");

    // Walk each incomplete game and diagnose
    const rows: DiagnosticGameRow[] = [];
    const blockerCounts: Record<Rule, number> = {
      notEligible: 0, blockedDay: 0, onVacation: 0, playedSameDate: 0,
      seasonACapReached: 0, weeklyCCapReached: 0, compositionBlocked: 0,
      doNotPair: 0, eligible: 0,
    };
    let cAdjacentIncomplete = 0;
    let totalEmptySlots = 0;

    for (const g of donsGames) {
      const assigned = assignmentsByGame.get(g.id) ?? [];
      if (assigned.length >= 4) continue;
      const empties = 4 - assigned.length;
      totalEmptySlots += empties;
      const currentIds = new Set(assigned.map((a) => a.playerId));
      const currentLevels = [...currentIds].map((id) => playerById.get(id)?.skillLevel ?? "?");
      const cCount = currentLevels.filter((l) => l === "C").length;
      const aCount = currentLevels.filter((l) => l === "A").length;
      const bCount = currentLevels.filter((l) => l === "B").length;

      // Only diagnose "C-adjacent" games — those with a C, or ones that
      // logically could still be filled with C to form an AACC
      // trajectory. If a game has 3 A/B and no C, it isn't gated by
      // C-player rules; skip it.
      const isCAdjacent = cCount > 0 || (aCount === 2 && bCount === 0 && empties >= 2);
      if (!isCAdjacent) continue;
      cAdjacentIncomplete++;

      // Composition state label — sorted skill string
      const compositionState = currentLevels.sort().join("") + (empties > 0 ? `+${empties}?` : "");

      const currentAssignments = assigned
        .sort((a, b) => a.slotPosition - b.slotPosition)
        .map((a) => {
          const p = playerById.get(a.playerId);
          return {
            playerId: a.playerId,
            name: p ? `${p.firstName} ${p.lastName}` : `player #${a.playerId}`,
            skill: p?.skillLevel ?? "?",
            contract: p?.contractedFrequency ?? "?",
            slot: a.slotPosition,
          };
        });

      // For each candidate, evaluate the rule ladder
      const candidatesEval: DiagnosticGameRow["candidates"] = [];
      for (const cand of candidatePool) {
        if (currentIds.has(cand.id)) continue; // already in game

        let ruling: Rule = "eligible";
        let detail: string | undefined;

        // 2. Blocked-day
        if ((blockedByPlayer.get(cand.id) ?? []).includes(g.dayOfWeek)) {
          ruling = "blockedDay";
          detail = `Blocked on ${DAY_NAMES[g.dayOfWeek]}`;
        }
        // 3. Vacation
        else if ((vacsByPlayer.get(cand.id) ?? []).some((v) => g.date >= v.startDate && g.date <= v.endDate)) {
          ruling = "onVacation";
          const v = (vacsByPlayer.get(cand.id) ?? []).find((v) => g.date >= v.startDate && g.date <= v.endDate)!;
          detail = `On vacation ${v.startDate} → ${v.endDate}`;
        }
        // 4. Played same date already
        else if ((datesPlayedByPlayer.get(cand.id) ?? new Set<string>()).has(g.date)) {
          ruling = "playedSameDate";
          detail = "Already playing another game on this date";
        }
        // 5. Season C-game cap — per-player cGamesLimit; null = Unlimited.
        else if (
          cCount > 0 &&
          cand.cGamesLimit != null &&
          (seasonACountByPlayer.get(cand.id) ?? 0) >= cand.cGamesLimit
        ) {
          ruling = "seasonACapReached";
          detail = `Already in ${seasonACountByPlayer.get(cand.id)} C-adjacent game(s) this season (limit ${cand.cGamesLimit})`;
        }
        // 6. Weekly C-game cap — flat 1-per-week, always enforced,
        // regardless of contract frequency.
        else if (
          cCount > 0 &&
          (weeklyCCountByKey.get(`${cand.id}|${g.weekNumber}`) ?? 0) >= 1
        ) {
          ruling = "weeklyCCapReached";
          detail = "Already in a C-adjacent game this week (hard 1/week cap)";
        }
        // 7. AACC composition trajectory blocked
        else if (cCount > 0) {
          // If candidate is A and existing state has a B, AACC is impossible.
          if (cand.skillLevel === "A" && bCount > 0) {
            ruling = "compositionBlocked";
            detail = "Game already has a B; adding an A ruins AACC trajectory";
          }
          // If candidate is B and C is already present, B is blocked.
          else if (cand.skillLevel === "B" && cCount > 0 && aCount > 0) {
            ruling = "compositionBlocked";
            detail = "Game has both A and C; B is blocked by AACC rule";
          }
          // AACC needs exactly 2 C's for the eventual game — if cCount > 2 already, no A/B fits.
          else if (cCount > 2) {
            ruling = "compositionBlocked";
            detail = `Game has ${cCount} C's — AACC requires exactly 2`;
          }
          // If candidate is B and cCount == 0 and aCount >= 1, B is fine (still non-AACC path)
          // If candidate is A and cCount === 2, this is the AACC completion path — eligible
        }
        // 8. Do-not-pair with anyone in the game
        if (ruling === "eligible") {
          const candDnp = dnpByPlayer.get(cand.id) ?? [];
          for (const aid of currentIds) {
            const otherDnp = dnpByPlayer.get(aid) ?? [];
            if (candDnp.includes(aid) || otherDnp.includes(cand.id)) {
              ruling = "doNotPair";
              const other = playerById.get(aid);
              detail = `Do-not-pair with ${other ? `${other.firstName} ${other.lastName}` : `#${aid}`}`;
              break;
            }
          }
        }

        blockerCounts[ruling]++;
        candidatesEval.push({
          playerId: cand.id,
          name: `${cand.firstName} ${cand.lastName}`,
          skill: cand.skillLevel,
          contract: cand.contractedFrequency,
          cGamesLimit: cand.cGamesLimit ?? null,
          ruling,
          detail,
        });
      }

      // Sort candidates: eligible first, then blockers grouped
      const RULE_ORDER: Record<Rule, number> = {
        eligible: 0, seasonACapReached: 1, weeklyCCapReached: 2,
        compositionBlocked: 3, playedSameDate: 4, doNotPair: 5,
        onVacation: 6, blockedDay: 7, notEligible: 8,
      };
      candidatesEval.sort((a, b) => {
        if (RULE_ORDER[a.ruling] !== RULE_ORDER[b.ruling]) return RULE_ORDER[a.ruling] - RULE_ORDER[b.ruling];
        return a.name.localeCompare(b.name);
      });

      rows.push({
        gameNumber: g.gameNumber,
        weekNumber: g.weekNumber,
        date: g.date,
        dayOfWeek: g.dayOfWeek,
        dayLabel: DAY_NAMES[g.dayOfWeek],
        court: g.courtNumber,
        startTime: g.startTime,
        currentAssignments,
        emptySlots: empties,
        cCount,
        compositionState,
        candidates: candidatesEval,
      });
    }

    // Sort games: earliest first
    rows.sort((a, b) => {
      if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.gameNumber - b.gameNumber;
    });

    // Top blockers, excluding "eligible"
    const topBlockers = Object.entries(blockerCounts)
      .filter(([r]) => r !== "eligible" && r !== "notEligible")
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count);

    // Contract split of candidate pool
    const byContract: Record<string, number> = { "2+": 0, "2": 0, "1+": 0, "1": 0 };
    for (const p of candidatePool) {
      const key = p.contractedFrequency in byContract ? p.contractedFrequency : "other";
      byContract[key] = (byContract[key] ?? 0) + 1;
    }

    return NextResponse.json({
      season: {
        id: season.id, startDate: season.startDate, endDate: season.endDate,
      },
      candidatePool: {
        total: candidatePool.length,
        byContract,
      },
      summary: {
        totalIncomplete: donsGames.filter((g) => (assignmentsByGame.get(g.id) ?? []).length < 4).length,
        cAdjacentIncomplete,
        totalEmptySlots,
        topBlockers,
      },
      games: rows,
    });
  } catch (err) {
    console.error("[c-slot-diagnosis GET] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
