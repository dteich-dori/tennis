import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, gameHandoffs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { bumpScheduleVersion } from "@/lib/bumpScheduleVersion";

/**
 * POST /api/games/undo-change
 *
 * Takes back a swap or give-away during the undo window, before any notice
 * has gone out. The body is the `undo` object that /api/games/swap or
 * /api/games/handoff returned. Nothing is trusted from it: the change is
 * only reversed if the rows are still exactly as that change left them, so a
 * stale or forged request cannot move anyone.
 */
export async function POST(request: NextRequest) {
  try {
    const u = (await request.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const database = await db();
    const stale = () =>
      NextResponse.json({ error: "That change can no longer be undone — the schedule has changed since." }, { status: 409 });

    if (u.kind === "swap") {
      const [a] = await database.select().from(gameAssignments).where(eq(gameAssignments.id, u.assignAId));
      const [b] = await database.select().from(gameAssignments).where(eq(gameAssignments.id, u.assignBId));
      if (!a || !b || a.swapSerial !== u.swapSerial || b.swapSerial !== u.swapSerial) return stale();
      //  The swap exchanged the two players; exchange them back.
      await database.update(gameAssignments)
        .set({ playerId: b.playerId, swapSerial: u.prevA?.swapSerial ?? null, swapReminderSentAt: u.prevA?.swapReminderSentAt ?? null })
        .where(eq(gameAssignments.id, a.id));
      await database.update(gameAssignments)
        .set({ playerId: a.playerId, swapSerial: u.prevB?.swapSerial ?? null, swapReminderSentAt: u.prevB?.swapReminderSentAt ?? null })
        .where(eq(gameAssignments.id, b.id));
      const [g] = await database.select().from(games).where(eq(games.id, a.gameId));
      if (g) await bumpScheduleVersion(g.seasonId);
      return NextResponse.json({ success: true });
    }

    if (u.kind === "handoff") {
      const [row] = await database.select().from(gameAssignments).where(eq(gameAssignments.id, u.assignmentId));
      if (!row || row.gameId !== u.gameId || row.playerId !== u.toPlayerId) return stale();
      await database.update(gameAssignments).set({ playerId: u.fromPlayerId }).where(eq(gameAssignments.id, row.id));
      await database.delete(gameHandoffs).where(and(
        eq(gameHandoffs.gameId, u.gameId), eq(gameHandoffs.fromPlayerId, u.fromPlayerId),
        eq(gameHandoffs.toPlayerId, u.toPlayerId), eq(gameHandoffs.createdAt, u.createdAt),
      ));
      const [g] = await database.select().from(games).where(eq(games.id, row.gameId));
      if (g) await bumpScheduleVersion(g.seasonId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown change" }, { status: 400 });
  } catch (err) {
    console.error("[games/undo-change] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
