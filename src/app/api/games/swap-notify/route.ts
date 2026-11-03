import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { deliverToPlayer, loadNoticeSettings, notifyIssuerAndCoordinator, type NoticeResult } from "@/lib/swapNotices";
import { generateSwapIcs } from "@/lib/ics";
import { firstPerSlot } from "@/lib/dedupeAssignments";

interface NotifyBody {
  gameAId: number;
  playerAId: number;
  gameBId: number;
  playerBId: number;
  /** The delegate who made the swap; omitted when the admin Swap tab did. */
  issuerPlayerId?: number;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtDate(g: { date: string; dayOfWeek: number }): string {
  const [y, m, d] = g.date.split("-").map(Number);
  return `${DAYS[g.dayOfWeek]} ${m}/${d}/${y}`;
}

function fmtTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr}${ampm}`;
}

function describe(g: { date: string; dayOfWeek: number; startTime: string; courtNumber: number }) {
  return `${fmtDate(g)} at ${fmtTime(g.startTime)}, Court ${g.courtNumber}`;
}

/**
 * POST /api/games/swap-notify
 *
 * Called from the Swap tab's "Notify players" button AFTER a swap has been
 * made — never automatically. Same body as /api/games/swap. Each of the two
 * players is told (text first, email as the fallback — see swapNotices) the game they gave up and the game they took, with two
 * calendar files (one cancels the old game, one adds the new one) and plain
 * instructions, since calendar apps do not all honour the cancel.
 */
export async function POST(request: NextRequest) {
  try {
    const { gameAId, playerAId, gameBId, playerBId, issuerPlayerId } = (await request.json()) as NotifyBody;
    if (!gameAId || !playerAId || !gameBId || !playerBId) {
      return NextResponse.json({ error: "gameAId, playerAId, gameBId, playerBId are required" }, { status: 400 });
    }

    const database = await db();
    const gameRows = await database.select().from(games).where(inArray(games.id, [gameAId, gameBId]));
    const gameA = gameRows.find((g) => g.id === gameAId);
    const gameB = gameRows.find((g) => g.id === gameBId);
    const playerRows = await database.select().from(players).where(inArray(players.id, [playerAId, playerBId]));
    const playerA = playerRows.find((p) => p.id === playerAId);
    const playerB = playerRows.find((p) => p.id === playerBId);
    if (!gameA || !gameB || !playerA || !playerB) {
      return NextResponse.json({ error: "Game or player not found" }, { status: 404 });
    }

    //  Guard against notifying about a swap that did not happen: after a
    //  real swap, A holds game B and B holds game A.
    const assignRows = await database
      .select()
      .from(gameAssignments)
      .where(inArray(gameAssignments.gameId, [gameAId, gameBId]));
    const withAssign = (g: typeof gameA) => ({
      ...g,
      assignments: firstPerSlot(assignRows.filter((a) => a.gameId === g.id)).sort(
        (a, b) => a.slotPosition - b.slotPosition
      ),
    });
    const gA = withAssign(gameA);
    const gB = withAssign(gameB);
    if (
      !gB.assignments.some((a) => a.playerId === playerAId) ||
      !gA.assignments.some((a) => a.playerId === playerBId)
    ) {
      return NextResponse.json(
        { error: "These players are not in the swapped games — nothing to notify." },
        { status: 409 }
      );
    }

    //  Co-player names for the event description.
    const coIds = [...gA.assignments, ...gB.assignments].map((a) => a.playerId);
    const nameRows = await database.select().from(players).where(inArray(players.id, coIds));
    const lookup = new Map(nameRows.map((p) => [p.id, { id: p.id, firstName: p.firstName, lastName: p.lastName }]));

    const settings = await loadNoticeSettings(gameA.seasonId);

    //  player -> [game they gave up, game they took]
    const legs = [
      { player: playerA, gave: gA, took: gB },
      { player: playerB, gave: gB, took: gA },
    ];

    const results: NoticeResult[] = [];
    for (const { player, gave, took } of legs) {
      const ics = generateSwapIcs(
        { id: player.id, firstName: player.firstName, lastName: player.lastName },
        took,
        gave,
        lookup
      );
      const emailText = [
        `Hi ${player.firstName},`,
        "",
        "Your swap has been made. Here is what changed on your schedule:",
        "",
        `NO LONGER PLAYING:  ${describe(gave)}  (Game #${gave.gameNumber})`,
        `NOW PLAYING:        ${describe(took)}  (Game #${took.gameNumber})`,
        "",
        "WHAT YOU NEED TO DO",
        "If you added your games to your calendar earlier, your calendar does not update by itself. Two files are attached:",
        "",
        "1. Open \"1-REMOVE-old-game.ics\". Apple Calendar and Outlook will take the old game off your calendar. Google Calendar often ignores it — if the old game is still there afterwards, delete it by hand.",
        "2. Open \"2-ADD-new-game.ics\" and confirm, to put the new game on your calendar.",
        "",
        "If you do not use the calendar feature, you can ignore the attachments. The swap board at the club stays the official record.",
      ].join("\n");
      const smsText =
        `Swap made. You're OUT of ${describe(gave)} (Game #${gave.gameNumber}). ` +
        `You're IN to ${describe(took)} (Game #${took.gameNumber}). ` +
        `If you keep games on your calendar, please update it.`;

      results.push(
        await deliverToPlayer(player, {
          settings,
          subject: `Your swap: now playing ${fmtDate(took)}`,
          emailText,
          smsText,
          attachments: [
            { filename: "1-REMOVE-old-game.ics", content: ics.remove, contentType: "text/calendar; charset=utf-8; method=CANCEL" },
            { filename: "2-ADD-new-game.ics", content: ics.add, contentType: "text/calendar; charset=utf-8" },
          ],
        })
      );
    }

    //  Copies: whoever issued the swap, and the game coordinator.
    const summary =
      `Swap: ${playerA.firstName} ${playerA.lastName} now plays ${describe(gB)} (Game #${gB.gameNumber}); ` +
      `${playerB.firstName} ${playerB.lastName} now plays ${describe(gA)} (Game #${gA.gameNumber}).`;
    results.push(
      ...(await notifyIssuerAndCoordinator({
        settings,
        issuerPlayerId,
        affectedPlayerIds: [playerAId, playerBId],
        subject: "Swap made",
        text: summary,
      }))
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[games/swap-notify] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
