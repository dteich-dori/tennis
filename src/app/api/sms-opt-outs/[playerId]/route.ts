import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/sms-opt-outs/[playerId]
 * Body: { optOut: boolean, reason?: string }
 *
 * Admin override for the sms_opt_out flag. Used by /sms-opt-outs to
 * re-enable SMS for a player who asked in person, or to proactively
 * opt someone out on their behalf.
 *
 * The reason field defaults to "Manual admin override — <opted-out or
 * re-enabled> on <timestamp>" so audit rows always carry provenance,
 * distinguishable from Twilio-webhook-driven changes.
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId: playerIdStr } = await ctx.params;
    const playerId = Number(playerIdStr);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      return NextResponse.json({ error: "Invalid playerId." }, { status: 400 });
    }
    const body = (await request.json()) as { optOut?: boolean; reason?: string };
    if (typeof body.optOut !== "boolean") {
      return NextResponse.json({ error: "optOut (boolean) is required." }, { status: 400 });
    }
    const database = await db();
    const [existing] = await database
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, playerId));
    if (!existing) {
      return NextResponse.json({ error: "Player not found." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const defaultReason = body.optOut
      ? `Manual admin opt-out at ${now}`
      : `Manual admin re-enable at ${now}`;
    const reason = body.reason?.trim() || defaultReason;

    await database
      .update(players)
      .set({
        smsOptOut: body.optOut,
        smsOptOutAt: now,
        smsOptOutReason: reason,
      })
      .where(eq(players.id, playerId));

    return NextResponse.json({ ok: true, playerId, optOut: body.optOut });
  } catch (err) {
    console.error("[sms-opt-outs PATCH] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
