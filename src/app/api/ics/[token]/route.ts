import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players, games, gameAssignments, seasons } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { generatePlayerIcs } from "@/lib/ics";

/**
 * Public calendar subscription endpoint.
 *
 * GET /api/ics/{token}            — full current-season schedule
 * GET /api/ics/{token}?preview=1  — only the first event (safe preview)
 *
 * The token is a per-player unguessable string. It's intentionally the only
 * credential — no auth, no cookies. Clients like Apple Calendar and Google
 * Calendar subscribe via webcal:// and periodically refetch this URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  const preview = request.nextUrl.searchParams.get("preview") === "1";

  const database = await db();

  // Look up player by token
  const [player] = await database
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      seasonId: players.seasonId,
    })
    .from(players)
    .where(eq(players.icsToken, token))
    .limit(1);

  if (!player) {
    return new NextResponse("Calendar not found", { status: 404 });
  }

  // Pick the current season (most recently created). We use the latest season
  // rather than the token's stored seasonId so that when the admin rolls the
  // season, subscribers automatically start receiving the new season's games.
  const [currentSeason] = await database
    .select({ id: seasons.id })
    .from(seasons)
    .orderBy(desc(seasons.id))
    .limit(1);
  const seasonIdToUse = currentSeason?.id ?? player.seasonId;

  // Fetch all games for the season
  const allGames = await database
    .select()
    .from(games)
    .where(eq(games.seasonId, seasonIdToUse));

  // Fetch assignments in batches (mirrors /api/games)
  const gameIds = allGames.map((g) => g.id);
  const allAssignments: {
    id: number;
    gameId: number;
    playerId: number;
    slotPosition: number;
    isPrefill: boolean;
  }[] = [];
  const BATCH_SIZE = 50;
  for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
    const batch = gameIds.slice(i, i + BATCH_SIZE);
    const batchResults = await database
      .select()
      .from(gameAssignments)
      .where(inArray(gameAssignments.gameId, batch));
    allAssignments.push(...batchResults);
  }
  const assignmentsByGame = new Map<number, typeof allAssignments>();
  for (const a of allAssignments) {
    const existing = assignmentsByGame.get(a.gameId) ?? [];
    existing.push(a);
    assignmentsByGame.set(a.gameId, existing);
  }

  // Build enriched games with assignments sorted by slotPosition
  const enrichedGames = allGames.map((g) => ({
    ...g,
    assignments: (assignmentsByGame.get(g.id) ?? []).sort(
      (a, b) => a.slotPosition - b.slotPosition
    ),
  }));

  // Filter to this player's normal games, sorted by date+time+court
  const playerGames = enrichedGames
    .filter(
      (g) =>
        g.status === "normal" &&
        g.assignments.some((a) => a.playerId === player.id)
    )
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.courtNumber - b.courtNumber;
    });

  const limitedGames = preview && playerGames.length > 0 ? [playerGames[0]] : playerGames;

  // Player lookup for descriptions (co-player names)
  const allActivePlayers = await database
    .select({ id: players.id, firstName: players.firstName, lastName: players.lastName })
    .from(players)
    .where(and(eq(players.seasonId, seasonIdToUse), eq(players.isActive, true)));
  const playerLookup = new Map(allActivePlayers.map((p) => [p.id, p]));

  const icsBody = generatePlayerIcs(
    { id: player.id, firstName: player.firstName, lastName: player.lastName },
    limitedGames,
    playerLookup
  );

  return new NextResponse(icsBody || "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TennisScheduler//Brooklake//EN\r\nX-WR-CALNAME:Brooklake Tennis\r\nEND:VCALENDAR\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="brooklake-tennis.ics"',
      // Let calendar clients cache for 1 hour, revalidate after that
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
