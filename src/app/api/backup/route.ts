import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import * as schema from "@/db/schema";
import { getBackupDir } from "@/lib/getBackupDir";
import path from "path";
import fs from "fs";

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
      appSettingsData,
      budgetParamsData,
      budgetItemsData,
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
      d.select().from(schema.appSettings),
      d.select().from(schema.budgetParams),
      d.select().from(schema.budgetItems),
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
      "app-settings": toCsv(appSettingsData),
      "budget-params": toCsv(budgetParamsData),
      "budget-items": toCsv(budgetItemsData),
    };

    // Save CSVs to timestamped subdirectory in Backup/
    const now = new Date();
    const datePart = now.toISOString().split("T")[0];
    const timePart = now.toTimeString().split(" ")[0].replace(/:/g, "_");
    const folderName = `${datePart}_${timePart}`;
    const baseDir = await getBackupDir();
    const backupDir = path.join(baseDir, folderName);
    fs.mkdirSync(backupDir, { recursive: true });

    for (const [name, csv] of Object.entries(tables)) {
      if (csv) {
        fs.writeFileSync(path.join(backupDir, `${name}.csv`), csv, "utf-8");
      }
    }

    return NextResponse.json({
      success: true,
      tables,
      backupFolder: folderName,
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
