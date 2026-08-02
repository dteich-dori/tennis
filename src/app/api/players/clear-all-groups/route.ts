import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players, playerGroupMembers } from "@/db/schema";
import { isNotNull } from "drizzle-orm";

/**
 * POST /api/players/clear-all-groups
 *
 * One-time wipe: nulls out every player's group_anchor_id AND truncates the
 * legacy player_group_members table. Use this after the v1.132/v1.133
 * model rollout to clear stale group data so you can rebuild from scratch
 * under the new C-anchor + member-(cGamesLimit!==0)-or-C rules.
 *
 * Safe to run any number of times — re-running is just another no-op clear.
 */
export async function POST() {
  try {
    const database = await db();

    // Count current memberships before wiping (for the response)
    const beforeAnchors = await database
      .select()
      .from(players)
      .where(isNotNull(players.groupAnchorId));
    const anchorCount = beforeAnchors.length;

    // Wipe
    await database.update(players).set({ groupAnchorId: null });
    await database.delete(playerGroupMembers);

    return NextResponse.json({
      success: true,
      cleared: anchorCount,
      message: `Cleared ${anchorCount} group memberships. All players now have no group anchor.`,
    });
  } catch (err) {
    console.error("[clear-all-groups] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
