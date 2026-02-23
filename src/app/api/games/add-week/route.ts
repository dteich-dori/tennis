import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, seasons, holidays, courtSchedules } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { sql } from "drizzle-orm";

/**
 * POST /api/games/add-week
 * Body: { seasonId: number }
 *
 * Adds one makeup week to the end of the season:
 * - Extends endDate by 7 days
 * - Increments totalWeeks
 * - Generates game slots for the new week
 * - Does NOT auto-assign players
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { seasonId: number };
    const { seasonId } = body;

    const database = await db();

    // 1. Fetch the season
    const [season] = await database
      .select()
      .from(seasons)
      .where(eq(seasons.id, seasonId));

    if (!season) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }

    const currentTotalWeeks = season.totalWeeks ?? 36;
    const newWeekNumber = currentTotalWeeks + 1;

    // 2. Fetch court schedule
    const courtSlots = await database
      .select()
      .from(courtSchedules)
      .where(eq(courtSchedules.seasonId, seasonId));

    if (courtSlots.length === 0) {
      return NextResponse.json(
        { error: "No court slots defined. Please set up court schedule first." },
        { status: 400 }
      );
    }

    // 3. Fetch holidays
    const holidayRows = await database
      .select()
      .from(holidays)
      .where(eq(holidays.seasonId, seasonId));

    const holidayDates = new Set(holidayRows.map((h) => h.date));
    const holidayNameMap = new Map(holidayRows.map((h) => [h.date, h.name || ""]));

    // 4. Get the current max game number
    const [maxResult] = await database
      .select({ maxNum: max(games.gameNumber) })
      .from(games)
      .where(eq(games.seasonId, seasonId));

    let gameNumber = (maxResult?.maxNum ?? 0) + 1;

    // 5. Calculate the Monday of the new week
    const startDate = new Date(season.startDate + "T12:00:00");
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + (newWeekNumber - 1) * 7);

    // 6. Generate game slots for the new week
    const gamesToInsert: {
      gameNumber: number;
      seasonId: number;
      weekNumber: number;
      date: string;
      dayOfWeek: number;
      startTime: string;
      courtNumber: number;
      group: string;
      status: string;
      holidayName: string;
    }[] = [];

    for (const slot of courtSlots) {
      const dayOffset = getDayOffset(slot.dayOfWeek);
      const gameDate = new Date(weekStart);
      gameDate.setDate(gameDate.getDate() + dayOffset);

      const dateStr = formatDate(gameDate);
      const isHoliday = holidayDates.has(dateStr);

      gamesToInsert.push({
        gameNumber,
        seasonId,
        weekNumber: newWeekNumber,
        date: dateStr,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        courtNumber: slot.courtNumber,
        group: slot.isSolo ? "solo" : "dons",
        status: isHoliday ? "holiday" : "normal",
        holidayName: isHoliday ? (holidayNameMap.get(dateStr) || "") : "",
      });

      gameNumber++;
    }

    // 7. Insert the new games
    if (gamesToInsert.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < gamesToInsert.length; i += CHUNK_SIZE) {
        const chunk = gamesToInsert.slice(i, i + CHUNK_SIZE);
        await database.insert(games).values(chunk);
      }
    }

    // 8. Update season: extend endDate by 7 days, increment totalWeeks
    const newEndDate = new Date(season.endDate + "T12:00:00");
    newEndDate.setDate(newEndDate.getDate() + 7);
    const newEndDateStr = formatDate(newEndDate);

    await database
      .update(seasons)
      .set({
        endDate: newEndDateStr,
        totalWeeks: newWeekNumber,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(seasons.id, seasonId));

    return NextResponse.json({
      success: true,
      weekNumber: newWeekNumber,
      gamesAdded: gamesToInsert.length,
      newEndDate: newEndDateStr,
    });
  } catch (err) {
    console.error("[games/add-week POST] error:", err);
    return NextResponse.json(
      { error: "Failed to add makeup week" },
      { status: 500 }
    );
  }
}

function getDayOffset(dayOfWeek: number): number {
  if (dayOfWeek === 0) return 6;
  return dayOfWeek - 1;
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
