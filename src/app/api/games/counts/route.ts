import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * GET /api/games/counts?seasonId=1&weekNumber=3
 * Returns per-player assignment counts:
 *   { [playerId]: { wtd: number, ytd: number, ytdDons: number, ytdSolo: number, wtdDons: number, wtdSolo: number } }
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    const weekNumber = request.nextUrl.searchParams.get("weekNumber");
    if (!seasonId || !weekNumber) {
      return NextResponse.json(
        { error: "seasonId and weekNumber required" },
        { status: 400 }
      );
    }

    const database = await db();
    const sid = parseInt(seasonId);
    const wk = parseInt(weekNumber);

    // YTD: count assignments per player per group from week 1 through the displayed week
    const ytdRows = await database
      .select({
        playerId: gameAssignments.playerId,
        group: games.group,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.status, "normal"),
          sql`${games.weekNumber} <= ${wk}`
        )
      )
      .groupBy(gameAssignments.playerId, games.group);

    // WTD: count assignments per player per group for the given week
    const wtdRows = await database
      .select({
        playerId: gameAssignments.playerId,
        group: games.group,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, sid),
          eq(games.weekNumber, wk),
          eq(games.status, "normal")
        )
      )
      .groupBy(gameAssignments.playerId, games.group);

    // Build result map
    const counts: Record<number, { wtd: number; ytd: number; ytdDons: number; ytdSolo: number; wtdDons: number; wtdSolo: number }> = {};

    for (const row of ytdRows) {
      if (!counts[row.playerId]) {
        counts[row.playerId] = { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
      }
      if (row.group === "dons") {
        counts[row.playerId].ytdDons += row.count;
      } else if (row.group === "solo") {
        counts[row.playerId].ytdSolo += row.count;
      }
      counts[row.playerId].ytd += row.count;
    }
    for (const row of wtdRows) {
      if (!counts[row.playerId]) {
        counts[row.playerId] = { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
      }
      if (row.group === "dons") {
        counts[row.playerId].wtdDons += row.count;
      } else if (row.group === "solo") {
        counts[row.playerId].wtdSolo += row.count;
      }
      counts[row.playerId].wtd += row.count;
    }

    return NextResponse.json(counts);
  } catch (err) {
    console.error("[games/counts GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load counts" },
      { status: 500 }
    );
  }
}
