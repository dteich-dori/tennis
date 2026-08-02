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
import { COMPOSITIONS, parseAllowedCompositions, canReachAllowed } from "@/lib/compositions";

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
 *   7. Composition trajectory blocked — adding this candidate, can the
 *      game still reach one of the season's actual Allowed Skill
 *      Compositions (Season Setup grid) with the remaining slots,
 *      given who else is realistically available that day? Mirrors
 *      auto-assign's canReachAllowed check exactly, including the
 *      same-day pool feasibility tightening.
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

    // The season's actual Allowed Skill Compositions grid (Season Setup).
    // NULL falls back to the same DEFAULT_ALLOWED_KEYS auto-assign uses.
    const allowedCompositionSet = parseAllowedCompositions(season.allowedCompositions ?? null);
    // Subset of allowed keys that include at least one C — used to test
    // whether a currently C-less game could still become C-adjacent.
    const cInclusiveAllowedSet = new Set(
      COMPOSITIONS.filter((comp) => comp.c > 0 && allowedCompositionSet.has(comp.key)).map((comp) => comp.key)
    );

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

    // Same-day pool of A/B/C bodies actually available that date, excluding
    // whoever's already in the game plus the candidate under evaluation —
    // mirrors auto-assign's pool-feasibility tightening on canReachAllowed.
    function computeDayPool(date: string, dayOfWeek: number, excludeIds: Set<number>) {
      let availA = 0, availB = 0, availC = 0;
      for (const pp of allPlayers) {
        if (excludeIds.has(pp.id)) continue;
        if ((blockedByPlayer.get(pp.id) ?? []).includes(dayOfWeek)) continue;
        if ((vacsByPlayer.get(pp.id) ?? []).some((v) => date >= v.startDate && date <= v.endDate)) continue;
        if ((datesPlayedByPlayer.get(pp.id) ?? new Set<string>()).has(date)) continue;
        if (pp.skillLevel === "A") availA++;
        else if (pp.skillLevel === "B") availB++;
        else if (pp.skillLevel === "C") availC++;
      }
      return { availA, availB, availC };
    }

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

      // Only diagnose "C-adjacent" games — those with a C already, or
      // ones whose empty slots could still reach a C-inclusive
      // composition from the season's actual Allowed Skill Compositions
      // grid. If a game can never legally include a C from here, it
      // isn't gated by C-player rules; skip it.
      const isCAdjacent =
        cCount > 0 || canReachAllowed(aCount, bCount, cCount, empties, cInclusiveAllowedSet);
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
        // 7. Composition trajectory blocked — same canReachAllowed test
        // auto-assign runs, against the season's actual Allowed Skill
        // Compositions grid (not a hardcoded AACC-only assumption).
        else {
          const postA = aCount + (cand.skillLevel === "A" ? 1 : 0);
          const postB = bCount + (cand.skillLevel === "B" ? 1 : 0);
          const postC = cCount + (cand.skillLevel === "C" ? 1 : 0);
          const remaining = empties - 1;
          const excludeIds = new Set([...currentIds, cand.id]);
          const pool = computeDayPool(g.date, g.dayOfWeek, excludeIds);
          if (!canReachAllowed(postA, postB, postC, remaining, allowedCompositionSet, pool)) {
            ruling = "compositionBlocked";
            const shape = "A".repeat(postA) + "B".repeat(postB) + "C".repeat(postC);
            detail = `${shape} + ${remaining} slot(s) left can't reach an allowed composition (pool that day: ${pool.availA}A/${pool.availB}B/${pool.availC}C)`;
          }
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
