import { db } from "@/db/getDb";
import { emailSettings, games, gameAssignments, gameHandoffs, players, emailLog } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { sendEmail, sendBulkSms, validateEmailConfig, hasSmsCapability } from "@/lib/email";
import { firstPerSlot } from "@/lib/dedupeAssignments";

/**
 * Evening-before notice for games that changed hands outright.
 *
 * For every game TOMORROW (ET) that had a player give it away
 * (game_handoffs, not yet announced), tells all four current players that
 * the line-up changed and who is playing. Each handed-off game is announced
 * once. This is in addition to the general reminder, which says nothing
 * about a change.
 *
 * Runs at the end of /api/cron/reminders (the plan allows one daily cron)
 * and is also reachable on its own at /api/cron/handoff-reminders.
 * Channel and sender come from the season's email_settings.
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
  const pending = await database
    .select({ h: gameHandoffs, g: games })
    .from(gameHandoffs)
    .innerJoin(games, eq(games.id, gameHandoffs.gameId))
    .where(and(isNull(gameHandoffs.reminderSentAt), eq(games.date, tomorrow), eq(games.status, "normal")));

  const byGame = new Map<number, { game: typeof games.$inferSelect; handoffs: (typeof gameHandoffs.$inferSelect)[] }>();
  for (const { h, g } of pending) {
    const e = byGame.get(g.id) ?? { game: g, handoffs: [] };
    e.handoffs.push(h);
    byGame.set(g.id, e);
  }

  const summary: { gameId: number; delivered: number; errors: string[] }[] = [];
  for (const { game, handoffs } of byGame.values()) {
    const [settings] = await database.select().from(emailSettings).where(eq(emailSettings.seasonId, game.seasonId)).limit(1);
    const fromName = settings?.fromName || "Tennis Club";
    const replyTo = settings?.replyTo || undefined;
    const channel = settings?.reminderChannel || "sms-fallback";

    const rows = await database.select().from(gameAssignments).where(eq(gameAssignments.gameId, game.id));
    const roster = firstPerSlot(rows).sort((a, b) => a.slotPosition - b.slotPosition);
    const nameIds = [...new Set([...roster.map((r) => r.playerId), ...handoffs.flatMap((h) => [h.fromPlayerId, h.toPlayerId])])];
    const pRows = await database.select().from(players).where(inArray(players.id, nameIds));
    const byId = new Map(pRows.map((p) => [p.id, p]));
    const nm = (id: number) => { const p = byId.get(id); return p ? `${p.firstName} ${p.lastName}` : "(unknown)"; };

    const changes = handoffs.map((h) => `${nm(h.toPlayerId)} is taking ${nm(h.fromPlayerId)}'s place`).join("; ");
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

      const hasEmail = !!p.email?.trim();
      const hasSms = !p.smsOptOut && hasSmsCapability(p.cellNumber, p.carrier);
      const email = async () => {
        if (!hasEmail) return false;
        const res = await sendEmail({ to: p.email!, subject, text: body, fromName, replyTo });
        if (!res.success) errors.push(`${nm(p.id)} email: ${res.error}`);
        return res.success;
      };
      const sms = async () => {
        if (!hasSms) return false;
        const res = await sendBulkSms([{ name: nm(p.id), phone: p.cellNumber!, carrier: p.carrier ?? undefined }], smsBody, fromName);
        if (res.errors.length) errors.push(...res.errors);
        return res.smsSent > 0;
      };
      let ok = false;
      if (channel === "email") ok = await email();
      else if (channel === "sms") ok = hasSms ? await sms() : await email();
      else if (channel === "both") { const e = await email(); const s = await sms(); ok = e || s; }
      else { ok = hasSms ? (await sms()) || (await email()) : await email(); }
      if (ok) delivered++;
    }

    //  Mark announced only if somebody actually received it; the date will
    //  have passed by tomorrow's run, so there is no retry either way.
    if (delivered > 0) {
      await database
        .update(gameHandoffs)
        .set({ reminderSentAt: new Date().toISOString() })
        .where(inArray(gameHandoffs.id, handoffs.map((h) => h.id)));
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
