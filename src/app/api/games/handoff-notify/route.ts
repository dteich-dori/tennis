import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, emailSettings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
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
 * giver is told the game is off their schedule (with a calendar cancel);
 * the receiver is told it is theirs (with the game to add). The other two
 * players hear about it from the evening-before cron.
 */
export async function POST(request: NextRequest) {
  try {
    const { gameId, fromPlayerId, toPlayerId } = (await request.json()) as {
      gameId: number; fromPlayerId: number; toPlayerId: number;
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

    const [settings] = await database.select().from(emailSettings).where(eq(emailSettings.seasonId, game.seasonId)).limit(1);
    const fromName = settings?.fromName || "Tennis Club";
    const replyTo = settings?.replyTo || undefined;
    const withAssign = { ...game, assignments };
    const others = assignments.filter((a) => a.playerId !== toPlayerId).map((a) => lookup.get(a.playerId)).filter(Boolean)
      .map((p) => `${p!.firstName} ${p!.lastName}`).join(", ");

    const send = async (p: typeof giver, subject: string, text: string, filename: string, ics: string, cancel: boolean) => {
      const name = `${p.firstName} ${p.lastName}`;
      if (!p.email?.trim()) return { playerId: p.id, name, sent: false, error: "No email address on file" };
      const r = await sendEmail({
        to: p.email, subject, text, fromName, replyTo,
        attachments: [{ filename, content: ics, contentType: `text/calendar; charset=utf-8${cancel ? "; method=CANCEL" : ""}` }],
      });
      return { playerId: p.id, name, sent: r.success, error: r.error };
    };

    const results = [
      await send(
        giver,
        `Game handed off: ${when(game)}`,
        [
          `Hi ${giver.firstName},`, "",
          `You are no longer playing: ${when(game)} (Game #${game.gameNumber}).`,
          `${receiver.firstName} ${receiver.lastName} has taken your place.`, "",
          "If you added your games to your calendar earlier, open the attached file to take this game off it. Apple Calendar and Outlook will remove it; Google Calendar often ignores the file — if the game is still there afterwards, delete it by hand.",
        ].join("\n"),
        "REMOVE-handed-off-game.ics",
        generateSingleGameIcs({ id: giver.id, firstName: giver.firstName, lastName: giver.lastName }, withAssign, lookup, "cancel"),
        true
      ),
      await send(
        receiver,
        `You are now playing: ${when(game)}`,
        [
          `Hi ${receiver.firstName},`, "",
          `${giver.firstName} ${giver.lastName} can't play, and you have taken the game:`,
          `${when(game)} (Game #${game.gameNumber}).`,
          others ? `You will be playing with: ${others}.` : "", "",
          "Open the attached file and confirm to add the game to your calendar. You will also get a reminder the evening before.",
        ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"),
        "ADD-new-game.ics",
        generateSingleGameIcs({ id: receiver.id, firstName: receiver.firstName, lastName: receiver.lastName }, withAssign, lookup, "add"),
        false
      ),
    ];
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[games/handoff-notify] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
