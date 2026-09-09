import { NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db/getDb";
import { seasons } from "@/db/schema";

/**
 * Delete protection — the guard for a schedule that has been released.
 *
 * Once players are holding a printed schedule, a stray click must not be
 * able to rewrite it. When seasons.delete_protection is on, every
 * season-wide delete and every auto-assign path refuses.
 *
 * The check lives on the SERVER on purpose. Greying out a button is a
 * courtesy; it does not survive a stale tab, a bookmarked POST, a second
 * device, or a hurried click that lands before the page finishes
 * loading. This function is the actual protection — the disabled buttons
 * just explain why.
 *
 * Deliberately NOT guarded: assign, unassign and swap. Those are the
 * one-at-a-time corrections a released schedule still needs, and each
 * touches a single slot the admin is looking at.
 */

/** HTTP 423 Locked — the resource exists but is deliberately frozen. */
const LOCKED = 423;

export const PROTECTION_MESSAGE =
  "Delete protection is on for this season: the schedule has been released to the " +
  "players, so bulk deletes and auto-assign are blocked. Turn it off in Season Setup " +
  "if you really mean to rewrite the schedule.";

/**
 * Whether the season is protected. Returns false if the column does not
 * exist yet (a database that has not run migration 0030), so an
 * un-migrated install fails OPEN rather than locking the admin out of
 * their own app.
 */
export async function isScheduleProtected(seasonId: number): Promise<boolean> {
  try {
    const database = await db();
    const [row] = await database
      .select({ p: seasons.deleteProtection })
      .from(seasons)
      .where(eq(seasons.id, seasonId));
    return row?.p === true;
  } catch (err) {
    console.warn("[scheduleProtection] could not read delete_protection:", err);
    return false;
  }
}

/**
 * Ids of every protected season. Used by the "delete everything" path,
 * which names no single season but would take the protected one with it.
 */
export async function protectedSeasonIds(): Promise<number[]> {
  try {
    const database = await db();
    const rows = await database
      .select({ id: seasons.id, p: seasons.deleteProtection })
      .from(seasons);
    return rows.filter((r) => r.p === true).map((r) => r.id);
  } catch (err) {
    console.warn("[scheduleProtection] could not list protected seasons:", err);
    return [];
  }
}

/**
 * Guard for a destructive route. Returns a 423 response to return
 * straight back to the caller, or null when the operation may proceed.
 *
 *   const blocked = await blockIfProtected(seasonId, "Auto-assign");
 *   if (blocked) return blocked;
 *
 * A missing/unparseable seasonId is not treated as protected — the route
 * itself is responsible for rejecting that with its own 400.
 */
export async function blockIfProtected(
  seasonId: number | string | null | undefined,
  operation: string
): Promise<NextResponse | null> {
  const id = typeof seasonId === "string" ? parseInt(seasonId, 10) : seasonId;
  if (id == null || !Number.isFinite(id)) return null;
  if (!(await isScheduleProtected(id))) return null;
  console.warn(`[scheduleProtection] refused "${operation}" on season ${id}`);
  return NextResponse.json(
    { error: PROTECTION_MESSAGE, deleteProtection: true, operation },
    { status: LOCKED }
  );
}

/**
 * Adds the column if it is missing, so the Season Setup toggle works on
 * a database that has not run migration 0030 yet. Mirrors the
 * self-healing already done for allowed_compositions in seasons PUT.
 */
export async function ensureDeleteProtectionColumn(): Promise<void> {
  try {
    const database = await db();
    const info = (await database.run(sql`PRAGMA table_info(seasons)`)) as unknown as {
      rows: { name: string }[];
    };
    const cols = new Set((info.rows ?? []).map((r) => r.name));
    if (!cols.has("delete_protection")) {
      await database.run(
        sql`ALTER TABLE \`seasons\` ADD COLUMN \`delete_protection\` integer DEFAULT 0 NOT NULL`
      );
      console.info("[scheduleProtection] added seasons.delete_protection");
    }
  } catch (err) {
    console.warn("[scheduleProtection] could not ensure the column:", err);
  }
}
