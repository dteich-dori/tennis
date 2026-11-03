import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/getDb";
import { players } from "@/db/schema";
import { hasSmsCapability, sendBulkSms } from "@/lib/email";

/**
 * POST /api/players/swap-admin-link-text  { playerId }
 *
 * Texts a swap delegate their private /swap-admin link. Admin-only (behind
 * the login wall; the /swap-admin/ allowlist does not cover this path). The
 * link is read from the player's own row, never taken from the request, so
 * this cannot be used to text arbitrary content.
 */
export async function POST(request: NextRequest) {
  try {
    const { playerId } = (await request.json()) as { playerId?: number };
    if (!playerId) return NextResponse.json({ error: "playerId is required" }, { status: 400 });

    const database = await db();
    const [p] = await database.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!p) return NextResponse.json({ error: "Player not found" }, { status: 404 });
    if (!p.swapAdminToken) {
      return NextResponse.json({ error: "This player has no swap admin link — tick Swap admin and save first." }, { status: 400 });
    }
    if (!p.isActive) return NextResponse.json({ error: "This player is inactive." }, { status: 400 });
    if (p.smsOptOut) {
      return NextResponse.json({ error: `${p.firstName} has opted out of texts. Copy the link and send it another way.` }, { status: 400 });
    }
    if (!hasSmsCapability(p.cellNumber, p.carrier)) {
      return NextResponse.json({ error: `${p.firstName} has no usable cell number on file.` }, { status: 400 });
    }

    const url = `${request.nextUrl.origin}/swap-admin/${p.swapAdminToken}`;
    const text =
      `Hi ${p.firstName}, this is your private Swap Admin link: ${url}\n\n` +
      `Tap it to open. To keep it on your home screen: tap the Share button, then "Add to Home Screen". ` +
      `Please don't forward this link.`;

    const r = await sendBulkSms([{ name: `${p.firstName} ${p.lastName}`, phone: p.cellNumber! }], text, "Tennis Club");
    if (r.smsSent < 1) {
      return NextResponse.json({ error: r.errors.join("; ") || "The text was not sent." }, { status: 502 });
    }
    return NextResponse.json({ success: true, sentTo: `${p.firstName} ${p.lastName}` });
  } catch (err) {
    console.error("[players/swap-admin-link-text] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
