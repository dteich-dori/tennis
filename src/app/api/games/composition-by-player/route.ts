import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { COMPOSITIONS, parseAllowedCompositions } from "@/lib/compositions";

/**
 * GET /api/games/composition-by-player?seasonId=5
 * For each active player, counts how many of their completed Don's games
 * fall into each of the 15 preset skill-level compositions (same key/order
 * as the "Allowed skill compositions" grid on Season Setup).
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }
    const database = await db();
    const sid = parseInt(seasonId);

    const [seasonRow] = await database.select().from(seasons).where(eq(seasons.id, sid));
    const allowedSet = parseAllowedCompositions(seasonRow?.allowedCompositions ?? null);

    const activePlayers = await database
      .select({ id: players.id, firstName: players.firstName, lastName: players.lastName, skillLevel: players.skillLevel })
      .from(players)
      .where(and(eq(players.seasonId, sid), eq(players.isActive, true)));

    const gameRows = await database
      .select({ gameId: games.id, weekNumber: games.weekNumber, gameNumber: games.gameNumber })
      .from(games)
      .where(and(eq(games.seasonId, sid), eq(games.status, "normal"), eq(games.group, "dons")));
    const gameInfoById = new Map(gameRows.map((g) => [g.gameId, g]));

    const assignmentRows = await database
      .select({
        gameId: gameAssignments.gameId,
        playerId: gameAssignments.playerId,
        skillLevel: players.skillLevel,
        firstName: players.firstName,
        lastName: players.lastName,
      })
      .from(gameAssignments)
      .innerJoin(players, eq(gameAssignments.playerId, players.id))
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(and(eq(games.seasonId, sid), eq(games.status, "normal"), eq(games.group, "dons")));

    const byGame = new Map<number, { playerId: number; skillLevel: string; firstName: string; lastName: string }[]>();
    for (const row of gameRows) byGame.set(row.gameId, []);
    for (const row of assignmentRows) {
      const arr = byGame.get(row.gameId);
      if (arr) arr.push({ playerId: row.playerId, skillLevel: row.skillLevel, firstName: row.firstName, lastName: row.lastName });
    }

    // playerId -> compositionKey -> count
    const counts = new Map<number, Map<string, number>>();
    for (const p of activePlayers) counts.set(p.id, new Map());

    // Compositions the season currently disallows are folded into a single
    // "OTHER" column rather than getting their own column (per-user request
    // to declutter — e.g. AAAC/ACCC when unchecked on Season Setup). Any
    // games that still occurred with a disallowed key (an actual rule
    // violation, not just an unused option) stay visible there instead of
    // silently vanishing from each player's total.
    let hasOtherGames = false;
    let incompleteGames = 0;
    let incompleteSlots = 0;
    const incompleteGameRows: { weekNumber: number; gameNumber: number; players: string[] }[] = [];
    for (const [gameId, roster] of byGame) {
      if (roster.length !== 4) {
        incompleteGames++;
        incompleteSlots += 4 - roster.length;
        const info = gameInfoById.get(gameId);
        incompleteGameRows.push({
          weekNumber: info?.weekNumber ?? 0,
          gameNumber: info?.gameNumber ?? 0,
          players: roster.map((r) => `${r.firstName} ${r.lastName} (${r.skillLevel})`),
        });
        continue; // only completed games count toward composition
      }
      const rawKey = roster.map((r) => r.skillLevel).sort().join("");
      const compKey = allowedSet.has(rawKey) ? rawKey : "OTHER";
      if (compKey === "OTHER") hasOtherGames = true;
      for (const { playerId } of roster) {
        const playerCounts = counts.get(playerId);
        if (!playerCounts) continue; // inactive player, skip
        playerCounts.set(compKey, (playerCounts.get(compKey) ?? 0) + 1);
      }
    }

    const rows = activePlayers
      .map((p) => ({
        playerId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        skillLevel: p.skillLevel,
        counts: Object.fromEntries(counts.get(p.id) ?? new Map()),
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

    const compositions = COMPOSITIONS.filter((c) => allowedSet.has(c.key)).map((c) => ({
      key: c.key,
      description: c.description,
    }));
    if (hasOtherGames) {
      compositions.push({ key: "OTHER", description: "Disallowed composition (rule violation)" });
    }

    incompleteGameRows.sort((a, b) => a.weekNumber - b.weekNumber || a.gameNumber - b.gameNumber);

    return NextResponse.json({
      compositions,
      rows,
      incompleteGames,
      incompleteSlots,
      incompleteGameRows,
    });
  } catch (error) {
    console.error("Composition-by-player report error:", error);
    return NextResponse.json({ error: "Failed to generate composition-by-player report" }, { status: 500 });
  }
}
