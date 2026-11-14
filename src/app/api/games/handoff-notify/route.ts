import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { deliverToPlayer, loadNoticeSettings, notifyIssuerAndCoordinator, type NoticeResult } from "@/lib/swapNotices";
import { generateSingleGameIcs } from "@/lib/ics";
import { firstPerSlot } from "@/lib/dedupeAssignments";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function when(g: { date: string; dayOfWeek: number; startTime: string; courtNumber: number }) {
  const [y, m, d] = g.date.split("-").map(Number);
  const [hh, mm] = g.startTime.split(":");
  let h = parseInt(hh, 10);
  const ap = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${DAYS[g.dayOfWeek]} ${m}/${d}/${y} at ${h}:${mm}${ap}, Court ${g.courtNumber}`;
}

/**
 * POST /api/games/handoff-notify  { gameId, fromPlayerId, toPlayerId }
 * From the "Notify players" button after a handoff — never automatic. The
 * giver is told the game is off their schedule; the receiver is told it is
 * theirs, with a calendar file for the game to add (none goes to the giver). The other two
 * players hear about it from the evening-before cron.
 */
export async function POST(request: NextRequest) {
  try {
    const { gameId, fromPlayerId, toPlayerId, issuerPlayerId, channelOverride } = (await request.json()) as {
      gameId: number; fromPlayerId: number; toPlayerId: number; issuerPlayerId?: number; channelOverride?: "email";
    };
    const database = await db();
    const [game] = await database.select().from(games).where(eq(games.id, gameId));
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    const rows = await database.select().from(gameAssignments).where(eq(gameAssignments.gameId, gameId));
    const assignments = firstPerSlot(rows).sort((a, b) => a.slotPosition - b.slotPosition);
    if (!assignments.some((a) => a.playerId === toPlayerId)) {
      return NextResponse.json({ error: "The receiving player is not in this game — nothing to notify." }, { status: 409 });
    }
    const ids = [...new Set([...assignments.map((a) => a.playerId), fromPlayerId])];
    const pRows = await database.select().from(players).where(inArray(players.id, ids));
    const lookup = new Map(pRows.map((p) => [p.id, { id: p.id, firstName: p.firstName, lastName: p.lastName }]));
    const giver = pRows.find((p) => p.id === fromPlayerId);
    const receiver = pRows.find((p) => p.id === toPlayerId);
    if (!giver || !receiver) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    const baseSettings = await loadNoticeSettings(game.seasonId);
    const settings = channelOverride === "email" ? { ...baseSettings, channel: "email" as const } : baseSettings;
    const others = assignments.filter((a) => a.playerId !== toPlayerId).map((a) => lookup.get(a.playerId)).filter(Boolean)
      .map((p) => `${p!.firstName} ${p!.lastName}`).join(", ");

    const send = (p: typeof giver, subject: string, text: string, smsText: string, ics?: string): Promise<NoticeResult> =>
      deliverToPlayer(p, {
        settings, subject, emailText: text, smsText,
        attachments: ics ? [{ filename: "new-game.ics", content: ics, contentType: "text/calendar; charset=utf-8" }] : undefined,
      });
    const receiverIcs = generateSingleGameIcs(
      { id: receiver.id, firstName: receiver.firstName, lastName: receiver.lastName },
      { ...game, assignments }, lookup, "add", `Taken over from ${giver.firstName} ${giver.lastName}`
    );

    const results: NoticeResult[] = [
      await send(
        giver,
        `Game handed off: ${when(game)}`,
        [
          `Hi ${giver.firstName},`, "",
          `You are no longer playing: ${when(game)} (Game #${game.gameNumber}).`,
          `${receiver.firstName} ${receiver.lastName} has taken your place.`, "",
          "Your calendar has not been changed — remove the game yourself if you keep it there.",
        ].join("\n"),
        `You're out of ${when(game)} (Game #${game.gameNumber}). ${receiver.firstName} ${receiver.lastName} has taken your place.`
      ),
      await send(
        receiver,
        `You are now playing: ${when(game)}`,
        [
          `Hi ${receiver.firstName},`, "",
          `${giver.firstName} ${giver.lastName} can't play, and you have taken the game:`,
          `${when(game)} (Game #${game.gameNumber}).`,
          others ? `You will be playing with: ${others}.` : "", "",
          "If you keep your games on a calendar, open the attached file to add this game. You will also get a reminder the evening before.",
        ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"),
        `${giver.firstName} ${giver.lastName} can't play, so you're IN: ${when(game)} (Game #${game.gameNumber})${others ? `, with ${others}` : ""}. You'll get a reminder the evening before.`,
        receiverIcs
      ),
    ];
    results.push(
      ...(await notifyIssuerAndCoordinator({
        settings,
        issuerPlayerId,
        affectedPlayerIds: [fromPlayerId, toPlayerId],
        subject: "Game given away",
        text: `Give-away: ${giver.firstName} ${giver.lastName} gave ${when(game)} (Game #${game.gameNumber}) to ${receiver.firstName} ${receiver.lastName}.`,
      }))
    );
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[games/handoff-notify] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
