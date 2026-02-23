import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, seasons, holidays, courtSchedules } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/games/generate
 * Body: { seasonId: number }
 *
 * Generates all game slots for the season:
 * - For each week (1 through totalWeeks), for each court slot, create a game record
 * - Mark games on holiday dates with status "holiday"
 * - Sequential game numbering across the entire season
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

    // 3. Fetch holidays (as a Set of date strings for fast lookup)
    const holidayRows = await database
      .select()
      .from(holidays)
      .where(eq(holidays.seasonId, seasonId));

    const holidayDates = new Set(holidayRows.map((h) => h.date));
    const holidayNameMap = new Map(holidayRows.map((h) => [h.date, h.name || ""]));

    // 4. Delete any existing games for this season (regeneration)
    await database.delete(games).where(eq(games.seasonId, seasonId));

    // 5. Generate games
    const startDate = new Date(season.startDate + "T00:00:00");
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

    let gameNumber = 1;

    const totalWeeks = season.totalWeeks ?? 36;

    for (let week = 1; week <= totalWeeks; week++) {
      // Calculate the Monday of this week
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + (week - 1) * 7);

      // For each court slot, find the date it falls on this week
      for (const slot of courtSlots) {
        // Calculate the date for this day of week within the current week
        // weekStart is Monday (day 1). We need to find the date for slot.dayOfWeek
        const dayOffset = getDayOffset(slot.dayOfWeek);
        const gameDate = new Date(weekStart);
        gameDate.setDate(gameDate.getDate() + dayOffset);

        const dateStr = formatDate(gameDate);

        // Check if this date is within the season range
        const endDate = new Date(season.endDate + "T00:00:00");
        if (gameDate > endDate) continue;

        // Determine status
        const isHoliday = holidayDates.has(dateStr);

        gamesToInsert.push({
          gameNumber,
          seasonId,
          weekNumber: week,
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
    }

    // 6. Batch insert games (SQLite has a limit, so chunk into groups of 50)
    const CHUNK_SIZE = 50;
    let insertedCount = 0;
    for (let i = 0; i < gamesToInsert.length; i += CHUNK_SIZE) {
      const chunk = gamesToInsert.slice(i, i + CHUNK_SIZE);
      await database.insert(games).values(chunk);
      insertedCount += chunk.length;
    }

    return NextResponse.json({
      success: true,
      gamesGenerated: insertedCount,
      totalWeeks,
      courtSlots: courtSlots.length,
      holidayGames: gamesToInsert.filter((g) => g.status === "holiday").length,
    });
  } catch (err) {
    console.error("[games/generate POST] error:", err);
    return NextResponse.json(
      { error: "Failed to generate games" },
      { status: 500 }
    );
  }
}

/**
 * Calculate the day offset from Monday (day 1) for a given day of week.
 * dayOfWeek: 0=Sunday, 1=Monday, 2=Tuesday, ..., 6=Saturday
 * Monday is the start of the week, so:
 *   Monday (1) → 0
 *   Tuesday (2) → 1
 *   ...
 *   Saturday (6) → 5
 *   Sunday (0) → 6
 */
function getDayOffset(dayOfWeek: number): number {
  if (dayOfWeek === 0) return 6; // Sunday is 6 days after Monday
  return dayOfWeek - 1; // Monday=0, Tuesday=1, etc.
}

/**
 * Format a Date object to YYYY-MM-DD string
 */
function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
