import { db } from "@/db/getDb";
import { games, gameAssignments, gameHandoffs, players, emailLog } from "@/db/schema";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { validateEmailConfig } from "@/lib/email";
import { deliverToPlayer, loadNoticeSettings } from "@/lib/swapNotices";
import { firstPerSlot } from "@/lib/dedupeAssignments";

/**
 * Evening-before notice for games whose line-up changed.
 *
 * For every game TOMORROW (ET) that had a player give it away
 * (game_handoffs) or was part of a swap (game_assignments.swap_serial) and
 * has not been announced yet, tells all four current players that the
 * line-up changed and who is playing. Each change is announced once. This is in addition to the general reminder, which says nothing
 * about a change.
 *
 * Runs at the end of /api/cron/reminders (the plan allows one daily cron)
 * and is also reachable on its own at /api/cron/handoff-reminders.
 * Channel (text first by default) and sender come from the season's
 * email_settings swap_channel.
 */
const TZ = "America/New_York";

function tomorrowEtDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const d = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmtWhen(date: string, startTime: string): string {
  const d = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: "UTC",
  });
  const [hh, mm] = startTime.split(":");
  let h = parseInt(hh, 10);
  const ap = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${d} at ${h}:${mm} ${ap}`;
}

export async function runHandoffReminders() {
  const tomorrow = tomorrowEtDate();
  const configError = validateEmailConfig();
  if (configError) {
    console.info(`[cron/handoff-reminders] skipped: ${configError}`);
    return { skipped: configError };
  }

  const database = await db();
  const pendingHandoffs = await database
    .select({ h: gameHandoffs, g: games })
    .from(gameHandoffs)
    .innerJoin(games, eq(games.id, gameHandoffs.gameId))
    .where(and(isNull(gameHandoffs.reminderSentAt), eq(games.date, tomorrow), eq(games.status, "normal")));
  const pendingSwaps = await database
    .select({ a: gameAssignments, g: games })
    .from(gameAssignments)
    .innerJoin(games, eq(games.id, gameAssignments.gameId))
    .where(
      and(
        isNotNull(gameAssignments.swapSerial),
        isNull(gameAssignments.swapReminderSentAt),
        eq(games.date, tomorrow),
        eq(games.status, "normal")
      )
    );

  type Entry = {
    game: typeof games.$inferSelect;
    handoffs: (typeof gameHandoffs.$inferSelect)[];
    swapped: (typeof gameAssignments.$inferSelect)[];
  };
  const byGame = new Map<number, Entry>();
  const entry = (g: typeof games.$inferSelect) => {
    const e = byGame.get(g.id) ?? { game: g, handoffs: [], swapped: [] };
    byGame.set(g.id, e);
    return e;
  };
  for (const { h, g } of pendingHandoffs) entry(g).handoffs.push(h);
  for (const { a, g } of pendingSwaps) entry(g).swapped.push(a);

  const summary: { gameId: number; delivered: number; errors: string[] }[] = [];
  for (const { game, handoffs, swapped } of byGame.values()) {
    const settings = await loadNoticeSettings(game.seasonId);
    const { fromName, replyTo } = settings;

    const rows = await database.select().from(gameAssignments).where(eq(gameAssignments.gameId, game.id));
    const roster = firstPerSlot(rows).sort((a, b) => a.slotPosition - b.slotPosition);
    const nameIds = [...new Set([...roster.map((r) => r.playerId), ...handoffs.flatMap((h) => [h.fromPlayerId, h.toPlayerId])])];
    const pRows = await database.select().from(players).where(inArray(players.id, nameIds));
    const byId = new Map(pRows.map((p) => [p.id, p]));
    const nm = (id: number) => { const p = byId.get(id); return p ? `${p.firstName} ${p.lastName}` : "(unknown)"; };

    const parts = handoffs.map((h) => `${nm(h.toPlayerId)} is taking ${nm(h.fromPlayerId)}'s place`);
    const swappedIn = [...new Set(swapped.map((a) => nm(a.playerId)))];
    if (swappedIn.length > 0) parts.push(`${swappedIn.join(" and ")} swapped into this game`);
    const changes = parts.join("; ");
    const lineup = roster.map((r) => nm(r.playerId)).join(", ");
    const subject = `Line-up change for tomorrow: ${fmtWhen(game.date, game.startTime)}`;
    const errors: string[] = [];
    let delivered = 0;

    for (const r of roster) {
      const p = byId.get(r.playerId);
      if (!p || !p.isActive) continue;
      const others = roster.filter((x) => x.playerId !== p.id).map((x) => nm(x.playerId)).join(", ");
      const body = [
        `Hi ${p.firstName},`, "",
        `Reminder: you play tomorrow, ${fmtWhen(game.date, game.startTime)}, Court ${game.courtNumber}.`,
        `Note the line-up has changed: ${changes}.`,
        `You will be playing with: ${others}.`,
      ].join("\n");
      const smsBody = `${subject}. Court ${game.courtNumber}. ${changes}. Line-up: ${lineup}.`;

      const res = await deliverToPlayer(p, { settings, subject, emailText: body, smsText: smsBody });
      if (res.sent) delivered++;
      else errors.push(`${nm(p.id)}: ${res.error}`);
    }

    //  Mark announced only if somebody actually received it; the date will
    //  have passed by tomorrow's run, so there is no retry either way.
    const now = new Date().toISOString();
    if (delivered > 0) {
      if (handoffs.length > 0) {
        await database.update(gameHandoffs).set({ reminderSentAt: now }).where(inArray(gameHandoffs.id, handoffs.map((h) => h.id)));
      }
      if (swapped.length > 0) {
        await database.update(gameAssignments).set({ swapReminderSentAt: now }).where(inArray(gameAssignments.id, swapped.map((a) => a.id)));
      }
    }
    await database.insert(emailLog).values({
      seasonId: game.seasonId,
      subject: errors.length ? `${subject} — ${errors.length} FAILED` : subject,
      body: errors.length ? errors.join("\n") : `${changes}.`,
      recipientGroup: "Line-up change reminder (auto)",
      recipientCount: delivered,
      recipientList: roster.map((r) => nm(r.playerId)).join(", "),
      fromName,
      replyTo: replyTo || "",
    });
    summary.push({ gameId: game.id, delivered, errors });
  }

  console.info(`[cron/handoff-reminders] tomorrow=${tomorrow} ${JSON.stringify(summary)}`);
  return { tomorrow, games: summary };
}
