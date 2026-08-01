import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import {
  games,
  gameAssignments,
  gameCappedSlots,
  players,
  playerBlockedDays,
  playerVacations,
  playerDoNotPair,
  seasons,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { weeklyContractedGames } from "@/lib/contractFrequency";
import { bumpScheduleVersion } from "@/lib/bumpScheduleVersion";

interface LogEntry {
  type: "info" | "warning" | "error";
  week?: number;
  message: string;
}

const A_TIER = new Set(["A"]);
const C_TIER = new Set(["C"]);

/**
 * POST /api/games/end-of-season-sweep
 * Body: { seasonId: number }
 *
 * Walks the cap-empty markers and tries to fill each slot with the
 * weekly cap lifted, but ONLY if the season's
 * allowCapOverrideAtSeasonEnd setting is true. Otherwise reports the
 * markers and exits without changes.
 *
 * Auto-fired by /api/games/auto-assign-all after all weeks have been
 * processed. Can also be hit standalone.
 */
export async function POST(request: NextRequest) {
  try {
    const { seasonId } = (await request.json()) as { seasonId: number };
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }
    const database = await db();
    const log: LogEntry[] = [];

    const [season] = await database.select().from(seasons).where(eq(seasons.id, seasonId));
    if (!season) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }

    // Pull all current cap-empty markers in this season
    const seasonGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.group, "dons"), eq(games.status, "normal")));
    const gameById = new Map(seasonGames.map((g) => [g.id, g]));
    const gameIds = seasonGames.map((g) => g.id);
    if (gameIds.length === 0) {
      return NextResponse.json({ success: true, markers: 0, filled: 0, log });
    }

    // Also load Solo assignments so the sweep never picks a player
    // who is already on a Solo game the same date (v1.207 fix).
    const soloAssignedByDate = new Map<string, Set<number>>();
    {
      const soloGameRows = await database
        .select({ id: games.id, date: games.date })
        .from(games)
        .where(and(eq(games.seasonId, seasonId), eq(games.group, "solo"), eq(games.status, "normal")));
      const soloIds = soloGameRows.map((g) => g.id);
      if (soloIds.length > 0) {
        const soloAssignments = await database
          .select({ playerId: gameAssignments.playerId, gameId: gameAssignments.gameId })
          .from(gameAssignments)
          .where(inArray(gameAssignments.gameId, soloIds));
        const dateById = new Map(soloGameRows.map((g) => [g.id, g.date]));
        for (const a of soloAssignments) {
          const date = dateById.get(a.gameId);
          if (!date) continue;
          const set = soloAssignedByDate.get(date) ?? new Set<number>();
          set.add(a.playerId);
          soloAssignedByDate.set(date, set);
        }
      }
    }

    const markers = await database
      .select()
      .from(gameCappedSlots)
      .where(inArray(gameCappedSlots.gameId, gameIds));

    if (markers.length === 0) {
      log.push({ type: "info", message: "End-of-season sweep: no cap-empty markers to process." });
      return NextResponse.json({ success: true, markers: 0, filled: 0, log });
    }

    if (!season.allowCapOverrideAtSeasonEnd) {
      log.push({
        type: "info",
        message: `End-of-season sweep: ${markers.length} cap-empty marker(s) found. Setting "Allow cap override at season end" is OFF — markers preserved, no slots filled.`,
      });
      return NextResponse.json({ success: true, markers: markers.length, filled: 0, log });
    }

    // === Override path: lift the cap and try to fill each marked slot ===
    // Load player + constraint data
    const allPlayers = await database
      .select()
      .from(players)
      .where(and(eq(players.seasonId, seasonId), eq(players.isActive, true), eq(players.excludedFromAutoAssign, false)));
    const playerIds = allPlayers.map((p) => p.id);
    const blockedRows = playerIds.length > 0
      ? await database.select().from(playerBlockedDays).where(inArray(playerBlockedDays.playerId, playerIds))
      : [];
    const vacRows = playerIds.length > 0
      ? await database.select().from(playerVacations).where(inArray(playerVacations.playerId, playerIds))
      : [];
    const dnpRows = playerIds.length > 0
      ? await database.select().from(playerDoNotPair).where(inArray(playerDoNotPair.playerId, playerIds))
      : [];

    const blockedByPlayer = new Map<number, number[]>();
    for (const b of blockedRows) {
      (blockedByPlayer.get(b.playerId) ?? blockedByPlayer.set(b.playerId, []).get(b.playerId)!).push(b.dayOfWeek);
    }
    const vacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
    for (const v of vacRows) {
      (vacsByPlayer.get(v.playerId) ?? vacsByPlayer.set(v.playerId, []).get(v.playerId)!).push(v);
    }
    const dnpByPlayer = new Map<number, number[]>();
    for (const d of dnpRows) {
      (dnpByPlayer.get(d.playerId) ?? dnpByPlayer.set(d.playerId, []).get(d.playerId)!).push(d.pairedPlayerId);
    }

    // Load existing assignments — used for STD-deficit ranking and per-date conflicts.
    const allAssignments = await database
      .select()
      .from(gameAssignments)
      .where(inArray(gameAssignments.gameId, gameIds));
    const assignmentsByGame = new Map<number, number[]>();
    for (const a of allAssignments) {
      const arr = assignmentsByGame.get(a.gameId) ?? [];
      arr.push(a.playerId);
      assignmentsByGame.set(a.gameId, arr);
    }
    const datesPlayedByPlayer = new Map<number, Set<string>>();
    const stdCountByPlayer = new Map<number, number>();
    for (const a of allAssignments) {
      const g = gameById.get(a.gameId);
      if (!g) continue;
      stdCountByPlayer.set(a.playerId, (stdCountByPlayer.get(a.playerId) ?? 0) + 1);
      const set = datesPlayedByPlayer.get(a.playerId) ?? new Set<string>();
      set.add(g.date);
      datesPlayedByPlayer.set(a.playerId, set);
    }

    const playerById = new Map(allPlayers.map((p) => [p.id, p]));
    const contractWeeks = 36;
    let filled = 0;

    // Season C-games cap (v1.223): the sweep is documented to lift the
    // WEEKLY cap only ("tries to fill each slot with the weekly cap
    // lifted") — it never checked any cap at all, so it was also lifting
    // each non-C player's season-total cGamesLimit allowance, undoing the
    // cap that auto-assign enforces per week. Count each non-C player's
    // existing C-adjacent games this season so the candidate filter below
    // can keep that season limit in force. v1.236: cGamesLimit === null
    // means Unlimited for that player (the season-wide floor it used to
    // fall back to was retired).
    const acGameCountByPlayer = new Map<number, number>();
    for (const [, pids] of assignmentsByGame) {
      const hasC = pids.some((pid) => playerById.get(pid)?.skillLevel === "C");
      if (!hasC) continue;
      for (const pid of pids) {
        const pl = playerById.get(pid);
        if (pl && pl.skillLevel !== "C") {
          acGameCountByPlayer.set(pid, (acGameCountByPlayer.get(pid) ?? 0) + 1);
        }
      }
    }

    // Sort markers by date+game so logs are time-ordered
    const sortedMarkers = [...markers].sort((a, b) => {
      const ga = gameById.get(a.gameId);
      const gb = gameById.get(b.gameId);
      if (!ga || !gb) return 0;
      if (ga.date !== gb.date) return ga.date.localeCompare(gb.date);
      if (ga.id !== gb.id) return ga.id - gb.id;
      return a.slotPosition - b.slotPosition;
    });

    for (const marker of sortedMarkers) {
      const game = gameById.get(marker.gameId);
      if (!game) continue;
      const currentAssigned = assignmentsByGame.get(game.id) ?? [];
      if (currentAssigned.length >= 4) {
        // Game is now full (manually filled since marker was written) — drop marker.
        await database
          .delete(gameCappedSlots)
          .where(and(eq(gameCappedSlots.gameId, game.id), eq(gameCappedSlots.slotPosition, marker.slotPosition)));
        continue;
      }
      // Build a candidate pool: not in this game, not playing this date,
      // not blocked-day, not on vacation, not DNP, composition-safe.
      const playersOnDate = new Set<number>();
      for (const g of seasonGames) {
        if (g.date !== game.date) continue;
        const ids = assignmentsByGame.get(g.id) ?? [];
        for (const pid of ids) playersOnDate.add(pid);
      }
      // Include Solo assignments too — same-date-across-groups is not allowed.
      for (const pid of (soloAssignedByDate.get(game.date) ?? new Set<number>())) {
        playersOnDate.add(pid);
      }
      const candidates = allPlayers.filter((p) => {
        if (p.contractedFrequency === "0") return false;
        if (currentAssigned.includes(p.id)) return false;
        if (playersOnDate.has(p.id)) return false;
        if ((blockedByPlayer.get(p.id) ?? []).includes(game.dayOfWeek)) return false;
        if ((vacsByPlayer.get(p.id) ?? []).some((v) => game.date >= v.startDate && game.date <= v.endDate)) return false;
        // DNP both directions
        const candDnp = dnpByPlayer.get(p.id) ?? [];
        for (const aid of currentAssigned) {
          if (candDnp.includes(aid)) return false;
          if ((dnpByPlayer.get(aid) ?? []).includes(p.id)) return false;
        }
        // Composition guard (legacy A+C / AACC rule): block adding an A
        // to a game with a C, or vice versa, unless heading to AACC.
        const levels = currentAssigned.map((id) => playerById.get(id)?.skillLevel ?? "B");
        const sa = levels.filter((l) => A_TIER.has(l)).length;
        const sb = levels.filter((l) => l === "B").length;
        const sc = levels.filter((l) => C_TIER.has(l)).length;
        if (A_TIER.has(p.skillLevel) && sc > 0) {
          if (!(sb === 0 && sc === 2 && sa < 2)) return false;
        }
        if (C_TIER.has(p.skillLevel) && sa > 0) {
          if (!(sb === 0 && sa === 2 && sc < 2)) return false;
        }
        if (p.skillLevel === "B" && sa > 0 && sc > 0) return false;
        // Season C-games cap stays in force even with the weekly cap
        // lifted — cGamesLimit is a hard per-player season-total
        // boundary, not a weekly scheduling nicety. null = Unlimited.
        if (p.skillLevel !== "C" && sc > 0 && p.cGamesLimit != null) {
          const seasonACCount = acGameCountByPlayer.get(p.id) ?? 0;
          if (seasonACCount >= p.cGamesLimit) return false;
        }
        // Cap-lifted intent: only invite players who are still in
        // STD-deficit (the season target hasn't been met). This makes
        // the override "give them a make-up game" rather than "fill
        // anyone."
        const std = stdCountByPlayer.get(p.id) ?? 0;
        const freq = weeklyContractedGames(p.contractedFrequency);
        if (freq === 0) return false;
        if (std >= freq * contractWeeks) return false;
        return true;
      });

      if (candidates.length === 0) {
        log.push({
          type: "info",
          week: game.weekNumber,
          message: `End-of-season sweep: Game #${game.gameNumber} slot ${marker.slotPosition}: no eligible cap-deficit candidate. Marker preserved.`,
        });
        continue;
      }

      // Rank by STD deficit desc, then random
      candidates.sort((a, b) => {
        const aStd = stdCountByPlayer.get(a.id) ?? 0;
        const bStd = stdCountByPlayer.get(b.id) ?? 0;
        const aDef = weeklyContractedGames(a.contractedFrequency) * contractWeeks - aStd;
        const bDef = weeklyContractedGames(b.contractedFrequency) * contractWeeks - bStd;
        if (bDef !== aDef) return bDef - aDef;
        return Math.random() - 0.5;
      });
      const chosen = candidates[0];

      await database.insert(gameAssignments).values({
        gameId: game.id,
        slotPosition: marker.slotPosition,
        playerId: chosen.id,
        isPrefill: false,
      });
      // Update in-memory trackers so subsequent markers see the new state
      currentAssigned.push(chosen.id);
      assignmentsByGame.set(game.id, currentAssigned);
      stdCountByPlayer.set(chosen.id, (stdCountByPlayer.get(chosen.id) ?? 0) + 1);
      if (chosen.skillLevel !== "C" && currentAssigned.some((pid) => playerById.get(pid)?.skillLevel === "C")) {
        acGameCountByPlayer.set(chosen.id, (acGameCountByPlayer.get(chosen.id) ?? 0) + 1);
      }
      const dates = datesPlayedByPlayer.get(chosen.id) ?? new Set<string>();
      dates.add(game.date);
      datesPlayedByPlayer.set(chosen.id, dates);
      // Drop marker
      await database
        .delete(gameCappedSlots)
        .where(and(eq(gameCappedSlots.gameId, game.id), eq(gameCappedSlots.slotPosition, marker.slotPosition)));
      filled++;
      log.push({
        type: "info",
        week: game.weekNumber,
        message: `[End-of-season sweep] Game #${game.gameNumber} slot ${marker.slotPosition}: ${chosen.lastName} assigned (cap lifted).`,
      });
    }

    log.push({
      type: "info",
      message: `End-of-season sweep done: ${filled}/${markers.length} cap-empty slot(s) filled.`,
    });

    if (filled > 0) await bumpScheduleVersion(seasonId);
    return NextResponse.json({ success: true, markers: markers.length, filled, log });
  } catch (err) {
    console.error("[end-of-season-sweep POST] error:", err);
    return NextResponse.json({ error: "End-of-season sweep failed: " + String(err) }, { status: 500 });
  }
}
