import { db } from "@/db/getDb";
import * as schema from "@/db/schema";
import { APP_VERSION } from "@/lib/version";

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

export interface BackupBundle {
  folderName: string;
  manifest: {
    appVersion: string;
    createdAt: string; // ISO
    rowCounts: Record<string, number>;
    seasons: Array<{
      id: number;
      startDate: string;
      endDate: string;
      totalWeeks: number;
    }>;
  };
  /** Combined JSON object: every table → array of rows */
  dataJson: Record<string, unknown[]>;
  /** Per-table CSV strings, key is the file name (no .csv extension) */
  csvFiles: Record<string, string>;
}

/**
 * Fetch every table and assemble both the JSON-everything object and the
 * per-table CSV strings. Pure: no filesystem writes here.
 */
export async function buildBackup(): Promise<BackupBundle> {
  const d = await db();

  const [
    seasonsData,
    playersData,
    blockedDaysData,
    vacationsData,
    doNotPairData,
    groupMembersData,
    courtSchedulesData,
    holidaysData,
    gamesData,
    assignmentsData,
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
    d.select().from(schema.playerGroupMembers),
    d.select().from(schema.courtSchedules),
    d.select().from(schema.holidays),
    d.select().from(schema.games),
    d.select().from(schema.gameAssignments),
    d.select().from(schema.emailTemplates),
    d.select().from(schema.emailLog),
    d.select().from(schema.emailSettings),
    d.select().from(schema.appSettings),
    d.select().from(schema.budgetParams),
    d.select().from(schema.budgetItems),
  ]);

  // Order matches the keys we'll use in dataJson and csvFiles
  const tables: Record<string, unknown[]> = {
    seasons: seasonsData,
    players: playersData,
    "player-blocked-days": blockedDaysData,
    "player-vacations": vacationsData,
    "player-do-not-pair": doNotPairData,
    "player-group-members": groupMembersData,
    "court-schedules": courtSchedulesData,
    holidays: holidaysData,
    games: gamesData,
    "game-assignments": assignmentsData,
    "email-templates": emailTemplatesData,
    "email-log": emailLogData,
    "email-settings": emailSettingsData,
    "app-settings": appSettingsData,
    "budget-params": budgetParamsData,
    "budget-items": budgetItemsData,
  };

  // Build CSV strings (skip empty ones — they'd be 0 bytes anyway)
  const csvFiles: Record<string, string> = {};
  const rowCounts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(tables)) {
    rowCounts[name] = rows.length;
    csvFiles[name] = toCsv(rows as Record<string, unknown>[]);
  }

  const now = new Date();
  const datePart = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const folderName = `Tennis-Scheduler-V${APP_VERSION}-${datePart}`;

  return {
    folderName,
    manifest: {
      appVersion: APP_VERSION,
      createdAt: now.toISOString(),
      rowCounts,
      seasons: seasonsData.map((s) => ({
        id: s.id,
        startDate: s.startDate,
        endDate: s.endDate,
        totalWeeks: s.totalWeeks,
      })),
    },
    dataJson: tables,
    csvFiles,
  };
}
