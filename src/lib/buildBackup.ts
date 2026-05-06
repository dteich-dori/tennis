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
  /** Human-readable restore guide (RESTORE.md content) */
  restoreMd: string;
  /** .env template with all required keys, no real secret values */
  envTemplate: string;
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

  const totalRows = Object.values(rowCounts).reduce((s, n) => s + n, 0);
  const seasonSummary =
    seasonsData.length > 0
      ? seasonsData
          .map(
            (s) => `  - Season ${s.id}: ${s.startDate} → ${s.endDate} (${s.totalWeeks} weeks)`
          )
          .join("\n")
      : "  (no seasons)";

  const envTemplate = buildEnvTemplate();
  const restoreMd = buildRestoreMd({
    folderName,
    appVersion: APP_VERSION,
    createdAt: now.toISOString(),
    totalRows,
    rowCounts,
    seasonSummary,
  });

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
    restoreMd,
    envTemplate,
  };
}

// =============================================================================
// Helpers — bundle a RESTORE.md and an .env template alongside the data so the
// backup folder is self-describing and a from-scratch rebuild is possible
// without external notes.
// =============================================================================

function buildEnvTemplate(): string {
  return [
    "# Brooklake Tennis Scheduler — environment template",
    "# Copy this file to .env.local and fill in real values.",
    "# All keys below are required (unless marked optional).",
    "",
    "# --- Database (Turso / libSQL) ---",
    "TURSO_DATABASE_URL=libsql://<your-db>.<region>.turso.io",
    "TURSO_AUTH_TOKEN=<jwt-from-turso-cli>",
    "",
    "# --- Authentication ---",
    "# AUTH_SECRET is used to HMAC the SITE_PASSWORD into a session cookie.",
    "# Any random 32+ character string works. Rotating it logs everyone out.",
    "AUTH_SECRET=<random-32-char-string>",
    "SITE_PASSWORD=<the-password-users-type-on-/login>",
    "",
    "# --- Email (Gmail SMTP via nodemailer) ---",
    "# GMAIL_APP_PASSWORD is a 16-char Google App Password (not your Gmail login).",
    "# https://myaccount.google.com/apppasswords",
    "GMAIL_USER=you@gmail.com",
    "GMAIL_APP_PASSWORD=<16-char-app-password>",
    "",
    "# --- Public URL (used for ICS links in emails) ---",
    "# Optional in dev (defaults to localhost). Required in production.",
    "# Vercel automatically provides VERCEL_PROJECT_PRODUCTION_URL — set this",
    "# only if you want the app to advertise a custom domain.",
    "# PUBLIC_SITE_URL=https://tennis.your-domain.com",
    "",
    "# --- Optional / legacy ---",
    "# RESEND_API_KEY was used by an older email path; not currently required.",
    "# RESEND_API_KEY=re_xxx",
    "",
  ].join("\n");
}

function buildRestoreMd(args: {
  folderName: string;
  appVersion: string;
  createdAt: string;
  totalRows: number;
  rowCounts: Record<string, number>;
  seasonSummary: string;
}): string {
  const tableLines = Object.entries(args.rowCounts)
    .map(([name, count]) => `| ${name} | ${count} |`)
    .join("\n");

  return `# Brooklake Tennis Scheduler — Restore Guide

This folder is a self-describing backup. With it plus the source repository
plus your secrets, you can fully reconstruct the running application from
scratch on a new machine or a new hosting provider.

## Backup metadata

- **Backup name:** \`${args.folderName}\`
- **App version:** \`${args.appVersion}\`
- **Created at (UTC):** \`${args.createdAt}\`
- **Total rows captured:** ${args.totalRows.toLocaleString()}

### Seasons present

${args.seasonSummary}

### Tables captured

| Table | Rows |
| --- | ---: |
${tableLines}

## What this folder contains

- \`manifest.json\` — machine-readable summary (version, date, row counts, seasons)
- \`data.json\` — every table as one JSON object (preferred for round-trip restore)
- \`csv/*.csv\` — same data, one file per table (human-readable, importable)
- \`RESTORE.md\` — this file
- \`env.template\` — required environment variables (placeholders only — no secrets)

## What this folder does NOT contain

- **Source code.** Get it from \`https://github.com/dteich-dori/tennis\` (or any tagged
  backup, e.g. \`Backup-Scheduler-V1.072\`).
- **Environment secrets.** See \`env.template\` for the required keys; values must
  come from a separate secure store (1Password / your records).
- **Vercel project settings.** The \`vercel.json\` cron schedule is in source.
  Project linkage to GitHub and the production env vars are configured in
  the Vercel dashboard.
- **The Turso database itself.** This backup contains the *contents* of the DB,
  not the DB instance. You either reuse the existing Turso instance or create
  a new one and import.

## Full reconstruction procedure

1. **Clone the repo**
   \`\`\`bash
   git clone https://github.com/dteich-dori/tennis.git
   cd tennis
   npm install
   \`\`\`

2. **Provision a Turso database** (skip if reusing the existing one)
   \`\`\`bash
   turso db create tennis-scheduler
   turso db tokens create tennis-scheduler
   \`\`\`
   Note the database URL and the auth token.

3. **Create \`.env.local\`** in the repo root by copying \`env.template\` from
   this folder, then filling in real values. See "Required environment
   variables" below.

4. **Apply the schema**
   \`\`\`bash
   npx drizzle-kit push
   \`\`\`
   This creates every table the app needs based on \`src/db/schema/\`.

5. **Import the data** — for each table, load \`data.json\` row by row, or
   import \`csv/<table>.csv\` via Turso's CLI / a custom script. The simplest
   round-trip is to write a one-off script that reads \`data.json\` and inserts
   every row into the matching Drizzle table. (We can build this if needed.)

6. **Verify locally**
   \`\`\`bash
   npm run dev
   \`\`\`
   Open http://localhost:3000, log in with \`SITE_PASSWORD\`, confirm Players
   / Schedule / Reports show the expected data.

7. **Deploy to Vercel** (optional)
   - Connect the GitHub repo in the Vercel dashboard
   - Set every environment variable from \`.env.local\` in the project's
     **Settings → Environment Variables**
   - Push to main and Vercel auto-deploys

## Required environment variables

See \`env.template\` in this folder for the full list with descriptions.
Briefly:

- \`TURSO_DATABASE_URL\` + \`TURSO_AUTH_TOKEN\` — database connection
- \`AUTH_SECRET\` + \`SITE_PASSWORD\` — login (HMAC-signed cookie)
- \`GMAIL_USER\` + \`GMAIL_APP_PASSWORD\` — outgoing email via Gmail SMTP
- \`PUBLIC_SITE_URL\` (optional) — for ICS calendar links

## Sanity-check after restore

- \`/players\` shows the same active player count as the manifest's
  \`players\` row count.
- \`/schedule\` shows the active season and games.
- \`/reports\` → "Players List" PDF generates without errors.
- An email send from \`/communications\` to a Test recipient succeeds.

If anything is off, compare the row counts in \`manifest.json\` to a fresh
backup taken from the restored DB.
`;
}
