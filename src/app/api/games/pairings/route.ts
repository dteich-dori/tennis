import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerDoNotPair } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/games/pairings?seasonId=1
 *
 * Returns player pairing data for Don's group:
 * - players: all active Don's players who have been assigned to at least one game
 * - pairings: for every pair of players who shared a game, the count
 * - doNotPairs: all do-not-pair relationships
 *
 * Algorithm: For each normal Don's game, get all assigned players.
 * For every pair (i, j) where i < j, increment their shared count.
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json(
        { error: "seasonId required" },
        { status: 400 }
      );
    }

    const database = await db();
    const sid = parseInt(seasonId);

    // 1. Get all normal Don's games for this season
    const donsGames = await database
      .select({ id: games.id })
      .from(games)
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.status, "normal"),
          eq(games.group, "dons")
        )
      );

    if (donsGames.length === 0) {
      return NextResponse.json({
        players: [],
        pairings: [],
        doNotPairs: [],
      });
    }

    // 2. Get all assignments for these games
    // Build a map: gameId -> playerId[]
    const gamePlayerMap = new Map<number, number[]>();
    const gameIds = donsGames.map((g) => g.id);

    // Batch query to avoid SQLite limits
    const BATCH = 50;
    for (let i = 0; i < gameIds.length; i += BATCH) {
      const batchIds = gameIds.slice(i, i + BATCH);
      for (const gid of batchIds) {
        const assigns = await database
          .select({ playerId: gameAssignments.playerId })
          .from(gameAssignments)
          .where(eq(gameAssignments.gameId, gid));
        if (assigns.length > 0) {
          gamePlayerMap.set(
            gid,
            assigns.map((a) => a.playerId)
          );
        }
      }
    }

    // 3. Count pairings
    // Key: "smallerId-largerId" -> count
    const pairCounts = new Map<string, number>();
    const playerIdsInGames = new Set<number>();

    for (const [, playerIds] of gamePlayerMap) {
      for (const pid of playerIds) {
        playerIdsInGames.add(pid);
      }
      // Generate all pairs (i, j) where i < j
      for (let i = 0; i < playerIds.length; i++) {
        for (let j = i + 1; j < playerIds.length; j++) {
          const p1 = Math.min(playerIds[i], playerIds[j]);
          const p2 = Math.max(playerIds[i], playerIds[j]);
          const key = `${p1}-${p2}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    // 4. Fetch player details for all players who appeared in games
    const allPlayers = await database
      .select()
      .from(players)
      .where(and(eq(players.seasonId, sid), eq(players.isActive, true)));

    // Include players who are active OR appeared in games
    const relevantPlayers = allPlayers.filter(
      (p) => playerIdsInGames.has(p.id)
    );

    // 5. Fetch do-not-pair relationships
    const allPlayerIds = relevantPlayers.map((p) => p.id);
    let dnpRows: { playerId: number; pairedPlayerId: number }[] = [];
    if (allPlayerIds.length > 0) {
      // Get all DNP rows for these players
      for (let i = 0; i < allPlayerIds.length; i += BATCH) {
        const batch = allPlayerIds.slice(i, i + BATCH);
        for (const pid of batch) {
          const rows = await database
            .select()
            .from(playerDoNotPair)
            .where(eq(playerDoNotPair.playerId, pid));
          dnpRows.push(
            ...rows.map((r) => ({
              playerId: r.playerId,
              pairedPlayerId: r.pairedPlayerId,
            }))
          );
        }
      }
    }

    // 6. Build response
    const playersResponse = relevantPlayers
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
      .map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        skillLevel: p.skillLevel,
      }));

    const pairingsResponse: { player1Id: number; player2Id: number; count: number }[] = [];
    for (const [key, count] of pairCounts) {
      const [p1, p2] = key.split("-").map(Number);
      // Only include pairs where both players are in our relevant set
      if (playerIdsInGames.has(p1) && playerIdsInGames.has(p2)) {
        pairingsResponse.push({ player1Id: p1, player2Id: p2, count });
      }
    }

    return NextResponse.json({
      players: playersResponse,
      pairings: pairingsResponse,
      doNotPairs: dnpRows,
    });
  } catch (err) {
    console.error("[games/pairings GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load pairings" },
      { status: 500 }
    );
  }
}
