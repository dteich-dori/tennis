import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import {
  players,
  games,
  gameAssignments,
  playerBlockedDays,
  playerVacations,
  playerDoNotPair,
  seasons,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { findSwapSuggestions, type SwapPlayer, type SwapGame } from "@/lib/swapSuggestions";

/**
 * Read-only swap suggestions for the public /swap-finder page.
 *
 * Deliberately narrow: it returns names, skill-matched partners and game
 * details, and NOTHING else. The admin /api/players endpoint carries
 * emails, phone numbers and account balances, which is why this page
 * does not use it.
 *
 * Nothing here writes. Executing a swap stays behind the login.
 *
 *   GET /api/public/swap-suggest
 *       -> { players: [{ id, firstName, lastName }] }  (contract players
 *          who actually hold a game, for the picker)
 *
 *   GET /api/public/swap-suggest?playerId=N&gameNumber=M
 *       -> { gameA, suggestions: [{ player, games: [...] }] }
 */
export const dynamic = "force-dynamic";

async function loadSeasonData() {
  const database = await db();
  const [season] = await database
    .select()
    .from(seasons)
    .orderBy(desc(seasons.id))
    .limit(1);
  if (!season) return null;

  const [pRows, gRows, aRows, blocked, vacs, dnp] = await Promise.all([
    database.select().from(players).where(eq(players.seasonId, season.id)),
    database.select().from(games).where(eq(games.seasonId, season.id)),
    database.select().from(gameAssignments),
    database.select().from(playerBlockedDays),
    database.select().from(playerVacations),
    database.select().from(playerDoNotPair),
  ]);

  const blockedBy = new Map<number, number[]>();
  for (const b of blocked) {
    const a = blockedBy.get(b.playerId) ?? [];
    a.push(b.dayOfWeek);
    blockedBy.set(b.playerId, a);
  }
  const vacsBy = new Map<number, { startDate: string; endDate: string }[]>();
  for (const v of vacs) {
    const a = vacsBy.get(v.playerId) ?? [];
    a.push({ startDate: v.startDate, endDate: v.endDate });
    vacsBy.set(v.playerId, a);
  }
  const dnpBy = new Map<number, number[]>();
  for (const d of dnp) {
    const a = dnpBy.get(d.playerId) ?? [];
    a.push(d.pairedPlayerId);
    dnpBy.set(d.playerId, a);
  }
  const assignBy = new Map<number, { playerId: number }[]>();
  for (const a of aRows) {
    const arr = assignBy.get(a.gameId) ?? [];
    arr.push({ playerId: a.playerId });
    assignBy.set(a.gameId, arr);
  }

  const swapPlayers: SwapPlayer[] = pRows.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    isActive: p.isActive,
    skillLevel: p.skillLevel,
    contractedFrequency: p.contractedFrequency,
    soloGames: p.soloGames,
    blockedDays: blockedBy.get(p.id) ?? [],
    vacations: vacsBy.get(p.id) ?? [],
    doNotPair: dnpBy.get(p.id) ?? [],
  }));

  const swapGames: SwapGame[] = gRows.map((g) => ({
    id: g.id,
    gameNumber: g.gameNumber,
    date: g.date,
    dayOfWeek: g.dayOfWeek,
    startTime: g.startTime,
    courtNumber: g.courtNumber,
    weekNumber: g.weekNumber,
    status: g.status,
    group: g.group,
    assignments: assignBy.get(g.id) ?? [],
  }));

  return { season, swapPlayers, swapGames };
}

export async function GET(request: NextRequest) {
  try {
    const data = await loadSeasonData();
    if (!data) return NextResponse.json({ error: "No season found" }, { status: 404 });
    const { season, swapPlayers, swapGames } = data;

    const playerIdRaw = request.nextUrl.searchParams.get("playerId");
    const gameNumberRaw = request.nextUrl.searchParams.get("gameNumber");

    // Picker mode: contract players who actually hold a normal game.
    if (!playerIdRaw) {
      const holdsAGame = new Set<number>();
      for (const g of swapGames) {
        if (g.status !== "normal") continue;
        for (const a of g.assignments) holdsAGame.add(a.playerId);
      }
      const list = swapPlayers
        .filter((p) => p.isActive && p.contractedFrequency !== "0" && holdsAGame.has(p.id))
        .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName }))
        .sort(
          (a, b) =>
            a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
        );
      return NextResponse.json({ players: list });
    }

    const playerId = parseInt(playerIdRaw, 10);
    const gameNumber = gameNumberRaw ? parseInt(gameNumberRaw, 10) : NaN;
    const playerA = swapPlayers.find((p) => p.id === playerId);
    if (!playerA) return NextResponse.json({ error: "Player not found" }, { status: 404 });
    if (!Number.isFinite(gameNumber)) {
      return NextResponse.json({ error: "Enter a game number" }, { status: 400 });
    }

    const gameA = swapGames.find((g) => g.gameNumber === gameNumber && g.status === "normal");
    if (!gameA) {
      return NextResponse.json(
        { error: `There is no game #${gameNumber} this season.` },
        { status: 404 }
      );
    }
    if (!gameA.assignments.some((a) => a.playerId === playerId)) {
      return NextResponse.json(
        {
          error: `${playerA.firstName} ${playerA.lastName} is not playing in game #${gameNumber}.`,
        },
        { status: 400 }
      );
    }

    const candidates = findSwapSuggestions({
      players: swapPlayers,
      games: swapGames,
      playerAId: playerId,
      gameAId: gameA.id,
      totalWeeks: season.totalWeeks,
      //  Generous window — Don is reading, not committing, and a wider
      //  net is more useful than a tidy one.
      weeksBack: 4,
      weeksAhead: 6,
      maxGamesPerPartner: 2,
    });

    // Group by partner so the phone can render one card per person.
    const grouped: {
      player: { id: number; firstName: string; lastName: string };
      games: { gameNumber: number; date: string; dayOfWeek: number; startTime: string; courtNumber: number; weekNumber: number }[];
    }[] = [];
    for (const c of candidates) {
      let entry = grouped.find((x) => x.player.id === c.playerB.id);
      if (!entry) {
        entry = {
          player: { id: c.playerB.id, firstName: c.playerB.firstName, lastName: c.playerB.lastName },
          games: [],
        };
        grouped.push(entry);
      }
      entry.games.push({
        gameNumber: c.gameY.gameNumber,
        date: c.gameY.date,
        dayOfWeek: c.gameY.dayOfWeek,
        startTime: c.gameY.startTime,
        courtNumber: c.gameY.courtNumber,
        weekNumber: c.gameY.weekNumber,
      });
    }

    return NextResponse.json({
      gameA: {
        gameNumber: gameA.gameNumber,
        date: gameA.date,
        dayOfWeek: gameA.dayOfWeek,
        startTime: gameA.startTime,
        courtNumber: gameA.courtNumber,
        weekNumber: gameA.weekNumber,
      },
      playerA: { firstName: playerA.firstName, lastName: playerA.lastName },
      suggestions: grouped,
    });
  } catch (err) {
    console.error("[public/swap-suggest] error:", err);
    return NextResponse.json({ error: "Failed to load suggestions" }, { status: 500 });
  }
}
