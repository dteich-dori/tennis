import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments } from "@/db/schema/games";
import { holidays } from "@/db/schema/holidays";
import { eq, and, inArray } from "drizzle-orm";

/**
 * POST /api/games/toggle-holiday
 * Toggles all games on a given date between "holiday" and "normal".
 * Also syncs the holidays table so future game generation stays consistent.
 * When marking as holiday, clears any player assignments on those games.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId: number;
      date: string; // ISO date string e.g. "2025-03-17"
      name?: string; // e.g. "Memorial Day"
    };
    const { seasonId, date, name } = body;

    if (!seasonId || !date) {
      return NextResponse.json(
        { error: "seasonId and date are required" },
        { status: 400 }
      );
    }

    const database = await db();

    // Find all games on this date for this season
    const dateGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.date, date)));

    if (dateGames.length === 0) {
      return NextResponse.json(
        { error: "No games found for this date" },
        { status: 404 }
      );
    }

    // Determine current status — if any game is holiday, toggle all to normal; otherwise toggle all to holiday
    const isCurrentlyHoliday = dateGames[0].status === "holiday";
    const newStatus = isCurrentlyHoliday ? "normal" : "holiday";
    const holidayName = newStatus === "holiday" ? (name || "") : "";

    const gameIds = dateGames.map((g) => g.id);

    // Update all games on this date
    await database
      .update(games)
      .set({ status: newStatus, holidayName })
      .where(inArray(games.id, gameIds));

    // If marking as holiday, clear all assignments on these games
    let clearedAssignments = 0;
    if (newStatus === "holiday") {
      const result = await database
        .delete(gameAssignments)
        .where(inArray(gameAssignments.gameId, gameIds));
      clearedAssignments = result.rowsAffected ?? 0;
    }

    // Sync the holidays table
    if (newStatus === "holiday") {
      // Add to holidays table if not already there
      const existing = await database
        .select()
        .from(holidays)
        .where(and(eq(holidays.seasonId, seasonId), eq(holidays.date, date)));
      if (existing.length === 0) {
        await database.insert(holidays).values({ seasonId, date, name: holidayName });
      } else {
        // Update existing holiday name
        await database
          .update(holidays)
          .set({ name: holidayName })
          .where(and(eq(holidays.seasonId, seasonId), eq(holidays.date, date)));
      }
    } else {
      // Remove from holidays table
      await database
        .delete(holidays)
        .where(and(eq(holidays.seasonId, seasonId), eq(holidays.date, date)));
    }

    return NextResponse.json({
      success: true,
      date,
      newStatus,
      holidayName,
      gamesUpdated: gameIds.length,
      clearedAssignments,
    });
  } catch (err) {
    console.error("[toggle-holiday] error:", err);
    return NextResponse.json(
      { error: "Failed to toggle holiday" },
      { status: 500 }
    );
  }
}
