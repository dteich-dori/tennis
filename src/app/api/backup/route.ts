import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import * as schema from "@/db/schema";

// Convert an array of objects to CSV string
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes("\n") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

export async function POST() {
  try {
    const d = await db();

    // Query all tables via Drizzle ORM (works in both dev and production)
    const [
      seasonsData,
      playersData,
      blockedDaysData,
      vacationsData,
      doNotPairData,
      soloPairsData,
      courtSchedulesData,
      holidaysData,
      gamesData,
      assignmentsData,
      ballCountsData,
      emailTemplatesData,
      emailLogData,
      emailSettingsData,
    ] = await Promise.all([
      d.select().from(schema.seasons),
      d.select().from(schema.players),
      d.select().from(schema.playerBlockedDays),
      d.select().from(schema.playerVacations),
      d.select().from(schema.playerDoNotPair),
      d.select().from(schema.playerSoloPairs),
      d.select().from(schema.courtSchedules),
      d.select().from(schema.holidays),
      d.select().from(schema.games),
      d.select().from(schema.gameAssignments),
      d.select().from(schema.ballCounts),
      d.select().from(schema.emailTemplates),
      d.select().from(schema.emailLog),
      d.select().from(schema.emailSettings),
    ]);

    // Build CSV data for each table
    const tables: Record<string, string> = {
      seasons: toCsv(seasonsData),
      players: toCsv(playersData),
      "player-blocked-days": toCsv(blockedDaysData),
      "player-vacations": toCsv(vacationsData),
      "player-do-not-pair": toCsv(doNotPairData),
      "player-solo-pairs": toCsv(soloPairsData),
      "court-schedules": toCsv(courtSchedulesData),
      holidays: toCsv(holidaysData),
      games: toCsv(gamesData),
      "game-assignments": toCsv(assignmentsData),
      "ball-counts": toCsv(ballCountsData),
      "email-templates": toCsv(emailTemplatesData),
      "email-log": toCsv(emailLogData),
      "email-settings": toCsv(emailSettingsData),
    };

    return NextResponse.json({
      success: true,
      tables,
      counts: {
        players: playersData.length,
        courtSchedules: courtSchedulesData.length,
        games: gamesData.length,
        assignments: assignmentsData.length,
      },
    });
  } catch (err) {
    console.error("[backup POST] error:", err);
    return NextResponse.json(
      { error: "Failed to create backup" },
      { status: 500 }
    );
  }
}
