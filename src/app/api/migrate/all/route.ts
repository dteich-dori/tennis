import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { sql } from "drizzle-orm";

/**
 * GET /api/migrate/all
 * Runs every known schema migration in sequence. Each migration is
 * idempotent (CREATE TABLE IF NOT EXISTS, or ALTER TABLE wrapped to silently
 * succeed if the column already exists). Safe to run any number of times —
 * after every deploy is a sensible cadence.
 *
 * Returns a per-migration status report so you can see what was applied
 * and what was already in place.
 */

const COLUMN_EXISTS_HINTS = ["duplicate column", "already exists"];

function isColumnAlreadyExists(err: unknown): boolean {
  const parts: string[] = [];
  let cur: unknown = err;
  while (cur) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  const combined = parts.join(" ").toLowerCase();
  return COLUMN_EXISTS_HINTS.some((h) => combined.includes(h));
}

interface Migration {
  name: string;
  description: string;
  /** Returns "applied" if it changed something, "already" if it was a no-op. */
  run: (
    database: Awaited<ReturnType<typeof db>>
  ) => Promise<"applied" | "already">;
}

// IMPORTANT: only append new migrations to the END of this list. Order is the
// order they'll be applied on a brand-new deploy. Each must be idempotent.
const MIGRATIONS: Migration[] = [
  {
    name: "preassigned-games-wanted",
    description: "players: add preassigned_games_wanted column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE players ADD COLUMN preassigned_games_wanted INTEGER`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "backup-dir2",
    description: "app_settings: add backup_dir2 column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE app_settings ADD COLUMN backup_dir2 TEXT`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "player-payments",
    description: "create player_payments table",
    run: async (database) => {
      // Returns "already" because CREATE IF NOT EXISTS is silent — we can't
      // easily tell whether the table was created or pre-existing without an
      // extra SELECT. Treat as a single idempotent step.
      await database.run(
        sql`CREATE TABLE IF NOT EXISTS player_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          paid_date TEXT NOT NULL,
          amount REAL NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      );
      return "applied";
    },
  },
  {
    name: "locked-extra-games",
    description: "players: add locked_extra_games column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE players ADD COLUMN locked_extra_games INTEGER`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "reminders-enabled",
    description: "email_settings: add reminders_enabled column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE email_settings ADD COLUMN reminders_enabled INTEGER NOT NULL DEFAULT 0`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "reminder-hour",
    description: "email_settings: add reminder_hour column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE email_settings ADD COLUMN reminder_hour INTEGER NOT NULL DEFAULT 18`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "reminder-template",
    description: "email_settings: add reminder_template column",
    run: async (database) => {
      try {
        await database.run(
          sql.raw(
            `ALTER TABLE email_settings ADD COLUMN reminder_template TEXT NOT NULL DEFAULT 'Hi {firstName},

Reminder: you have a game tomorrow ({date}) at {time} on Court {court}.

Partners: {partners}

See you on the courts!'`
          )
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "reminder-channel",
    description: "email_settings: add reminder_channel column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE email_settings ADD COLUMN reminder_channel TEXT NOT NULL DEFAULT 'both'`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "reminder-template-id",
    description: "email_settings: add reminder_template_id column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE email_settings ADD COLUMN reminder_template_id INTEGER`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "excluded-from-auto-assign",
    description: "players: add excluded_from_auto_assign column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE players ADD COLUMN excluded_from_auto_assign INTEGER NOT NULL DEFAULT 0`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
];

export async function GET() {
  const database = await db();
  const results: Array<{
    name: string;
    description: string;
    status: "applied" | "already" | "error";
    error?: string;
  }> = [];

  for (const m of MIGRATIONS) {
    try {
      const status = await m.run(database);
      results.push({ name: m.name, description: m.description, status });
    } catch (err) {
      console.error(`[migrate/all] ${m.name} failed:`, err);
      results.push({
        name: m.name,
        description: m.description,
        status: "error",
        error: String(err),
      });
    }
  }

  const errors = results.filter((r) => r.status === "error");
  return NextResponse.json(
    {
      success: errors.length === 0,
      migrationsRun: results.length,
      applied: results.filter((r) => r.status === "applied").length,
      alreadyInPlace: results.filter((r) => r.status === "already").length,
      errors: errors.length,
      results,
    },
    { status: errors.length === 0 ? 200 : 207 }
  );
}
