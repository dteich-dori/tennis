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
  // The locked-extra-games step was removed in v2.277 along with the
  // whole extras-lock mechanism — re-adding the column here would undo
  // migration 0024, which drops it.
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
  {
    name: "last-auto-assign-at",
    description: "seasons: add last_auto_assign_at column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE seasons ADD COLUMN last_auto_assign_at TEXT`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "last-player-change-at",
    description: "seasons: add last_player_change_at column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE seasons ADD COLUMN last_player_change_at TEXT`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "schedule-version",
    description: "seasons: add schedule_version column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE seasons ADD COLUMN schedule_version INTEGER NOT NULL DEFAULT 1`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "days-per-week",
    description: "seasons: add days_per_week column (default 5 = Mon-Fri)",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE seasons ADD COLUMN days_per_week INTEGER NOT NULL DEFAULT 5`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "drop-is-derated",
    description: "players: drop is_derated column (concept retired in v1.151)",
    run: async (database) => {
      try {
        await database.run(sql`ALTER TABLE players DROP COLUMN is_derated`);
        return "applied";
      } catch (err) {
        // 'no such column' = already dropped (idempotent)
        const msg = String((err as Error)?.message ?? err).toLowerCase();
        if (msg.includes("no such column") || msg.includes("no column")) return "already";
        throw err;
      }
    },
  },
  {
    name: "drop-max-derated-per-week",
    description: "seasons: drop max_derated_per_week column (concept retired in v1.151)",
    run: async (database) => {
      try {
        await database.run(sql`ALTER TABLE seasons DROP COLUMN max_derated_per_week`);
        return "applied";
      } catch (err) {
        const msg = String((err as Error)?.message ?? err).toLowerCase();
        if (msg.includes("no such column") || msg.includes("no column")) return "already";
        throw err;
      }
    },
  },
  {
    name: "group-anchor-id",
    description: "players: add group_anchor_id column",
    run: async (database) => {
      try {
        await database.run(
          sql`ALTER TABLE players ADD COLUMN group_anchor_id INTEGER`
        );
        return "applied";
      } catch (err) {
        if (isColumnAlreadyExists(err)) return "already";
        throw err;
      }
    },
  },
  {
    name: "migrate-group-members-to-anchor",
    description:
      "data: convert existing player_group_members rows to players.group_anchor_id when leader is C and member is A/B with cGamesOk",
    run: async (database) => {
      // Idempotent: only sets the anchor when it's currently NULL.
      // Skips rows where the leader isn't a C player, or where the
      // member doesn't have cGamesOk, or where the member is a C player
      // themselves (C players are anchors, not members).
      const result = await database.run(
        sql`UPDATE players
            SET group_anchor_id = (
              SELECT pgm.player_id
              FROM player_group_members pgm
              JOIN players leader ON leader.id = pgm.player_id
              WHERE pgm.member_id = players.id
                AND leader.skill_level = 'C'
              LIMIT 1
            )
            WHERE group_anchor_id IS NULL
              AND c_games_ok = 1
              AND skill_level IN ('A', 'B')
              AND EXISTS (
                SELECT 1 FROM player_group_members pgm
                JOIN players leader ON leader.id = pgm.player_id
                WHERE pgm.member_id = players.id
                  AND leader.skill_level = 'C'
              )`
      );
      const rowsChanged = (result as { rowsAffected?: number }).rowsAffected ?? 0;
      return rowsChanged > 0 ? "applied" : "already";
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
