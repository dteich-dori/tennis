/**
 * Bump `seasons.schedule_version` for a given season. Called by every API
 * endpoint that mutates the game/assignment data — auto-assign, manual
 * assign/unassign, swap, re-assign, clear-assignments, holiday toggle,
 * ball balancer, pairing balancer, solo-assign, etc.
 *
 * The version is a monotonic counter stamped on every report PDF so the
 * admin can tell at a glance whether two reports were generated against
 * the same schedule snapshot.
 *
 * Failures are logged but not thrown — a stamp bump failure must never
 * break the underlying mutation.
 */

import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/db/getDb";
import { seasons } from "@/db/schema";

export async function bumpScheduleVersion(seasonId: number): Promise<void> {
  try {
    const database = await db();
    await database
      .update(seasons)
      .set({ scheduleVersion: sql`schedule_version + 1` })
      .where(eq(seasons.id, seasonId));
  } catch (err) {
    console.error(
      `[bumpScheduleVersion] failed for seasonId=${seasonId}:`,
      err
    );
  }
}
