import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import {
  emailSettings,
  seasons,
  games,
  gameAssignments,
  players,
  emailLog,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sendEmail, sendBulkSms, validateEmailConfig } from "@/lib/email";

/**
 * GET /api/cron/reminders
 *
 * Hourly Vercel cron. For every season whose email_settings has
 * `reminders_enabled = 1` AND `reminder_hour` matches the current ET hour,
 * send a per-player reminder for tomorrow's NORMAL games (status='normal',
 * any group). Each player gets one personalised message via email and/or
 * SMS according to what their profile has.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Vercel cron sends
 * this automatically when CRON_SECRET is set. If CRON_SECRET is unset
 * (local dev) the route is open.
 */

const TZ = "America/New_York";

function nowEtHour(): number {
  // Intl.DateTimeFormat in en-US hour12=false gives "24" for midnight; convert.
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n % 24 : -1;
}

/** YYYY-MM-DD for "tomorrow" in ET. */
function tomorrowEtDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) =>
    parts.find((p) => p.type === t)?.value ?? "";
  const todayEt = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  todayEt.setUTCDate(todayEt.getUTCDate() + 1);
  return todayEt.toISOString().slice(0, 10);
}

function substitute(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, name: string) => {
    const key = name.toLowerCase();
    const v = ctx[key];
    return v !== undefined ? v : full;
  });
}

function formatTime(hhmm: string): string {
  // "08:15" → "8:15 AM"
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${min} ${ampm}`;
}

function formatDate(yyyymmdd: string): string {
  // "2026-05-10" → "Sun May 10"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) return yyyymmdd;
  const d = new Date(`${yyyymmdd}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export async function GET(request: NextRequest) {
  // --- Auth ---
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // `force=1` bypasses the hour-match gate — for manual testing.
  const force = request.nextUrl.searchParams.get("force") === "1";
  const currentHour = nowEtHour();
  const tomorrow = tomorrowEtDate();

  const database = await db();

  // Load every season's email_settings (filter to enabled in-loop so we can
  // report which seasons were skipped).
  const allSettings = await database.select().from(emailSettings);
  const allSeasons = await database.select().from(seasons);
  const seasonById = new Map(allSeasons.map((s) => [s.id, s]));

  const seasonResults: Array<{
    seasonId: number;
    skipped?: string;
    emailsSent?: number;
    smsSent?: number;
    errors?: string[];
    recipients?: string[];
  }> = [];

  for (const settings of allSettings) {
    const season = seasonById.get(settings.seasonId);
    if (!season) {
      seasonResults.push({
        seasonId: settings.seasonId,
        skipped: "season not found",
      });
      continue;
    }
    if (!settings.remindersEnabled) {
      seasonResults.push({ seasonId: settings.seasonId, skipped: "disabled" });
      continue;
    }
    if (!force && settings.reminderHour !== currentHour) {
      seasonResults.push({
        seasonId: settings.seasonId,
        skipped: `hour mismatch (now=${currentHour}, configured=${settings.reminderHour} ET)`,
      });
      continue;
    }
    if (validateEmailConfig()) {
      seasonResults.push({
        seasonId: settings.seasonId,
        skipped: `email not configured: ${validateEmailConfig()}`,
      });
      continue;
    }

    // Find tomorrow's normal games for this season
    const tomorrowGames = await database
      .select({
        gameId: games.id,
        date: games.date,
        startTime: games.startTime,
        courtNumber: games.courtNumber,
        group: games.group,
      })
      .from(games)
      .where(
        and(
          eq(games.seasonId, settings.seasonId),
          eq(games.date, tomorrow),
          eq(games.status, "normal")
        )
      );

    if (tomorrowGames.length === 0) {
      seasonResults.push({
        seasonId: settings.seasonId,
        skipped: `no games on ${tomorrow}`,
      });
      continue;
    }

    const gameIds = tomorrowGames.map((g) => g.gameId);

    // Load all assignments for those games, plus the player records
    const assignmentRows = await database
      .select({
        gameId: gameAssignments.gameId,
        playerId: players.id,
        firstName: players.firstName,
        lastName: players.lastName,
        email: players.email,
        cellNumber: players.cellNumber,
        carrier: players.carrier,
        slotPosition: gameAssignments.slotPosition,
      })
      .from(gameAssignments)
      .innerJoin(players, eq(gameAssignments.playerId, players.id))
      .where(
        // drizzle-orm doesn't yet expose inArray for joins cleanly here, so
        // gate via the game-level loop below instead. Pull everything for
        // the season's tomorrow games and filter in-memory.
        eq(players.isActive, true)
      );

    // Filter to just the assignments belonging to tomorrow's games
    const gameIdSet = new Set(gameIds);
    const relevant = assignmentRows.filter((r) => gameIdSet.has(r.gameId));

    // Group by gameId so we can compute "partners"
    const byGame = new Map<number, typeof relevant>();
    for (const r of relevant) {
      const arr = byGame.get(r.gameId) ?? [];
      arr.push(r);
      byGame.set(r.gameId, arr);
    }

    // Send one message per (player, game). If a player has two games
    // tomorrow (rare) they get two messages.
    let emailsSent = 0;
    let smsSent = 0;
    const errors: string[] = [];
    const recipients: string[] = [];

    for (const g of tomorrowGames) {
      const roster = byGame.get(g.gameId) ?? [];
      const gameMeta = g;
      for (const player of roster) {
        const partners = roster
          .filter((p) => p.playerId !== player.playerId)
          .sort((a, b) => a.slotPosition - b.slotPosition)
          .map((p) => `${p.firstName} ${p.lastName}`)
          .join(", ");

        const ctx: Record<string, string> = {
          firstname: player.firstName,
          lastname: player.lastName,
          name: `${player.firstName} ${player.lastName}`,
          date: formatDate(gameMeta.date),
          time: formatTime(gameMeta.startTime),
          court: String(gameMeta.courtNumber),
          partners: partners || "(no other players yet)",
          group: gameMeta.group,
        };

        const body = substitute(settings.reminderTemplate, ctx);
        const subject = `Game reminder — ${ctx.date} at ${ctx.time}`;

        const hasEmail = !!(player.email && player.email.trim());
        const hasSms = !!(player.cellNumber && player.carrier);

        if (hasEmail) {
          const result = await sendEmail({
            to: player.email!,
            subject,
            text: body,
            fromName: settings.fromName,
            replyTo: settings.replyTo || undefined,
          });
          if (result.success) {
            emailsSent++;
            recipients.push(ctx.name);
          } else {
            errors.push(`${ctx.name} email: ${result.error}`);
          }
        }
        if (hasSms) {
          const partial = await sendBulkSms(
            [
              {
                name: ctx.name,
                phone: player.cellNumber!,
                carrier: player.carrier!,
              },
            ],
            body,
            settings.fromName
          );
          smsSent += partial.smsSent;
          errors.push(...partial.errors);
          if (partial.smsSent > 0 && !hasEmail) recipients.push(ctx.name);
        }
      }
    }

    if (recipients.length > 0) {
      await database.insert(emailLog).values({
        seasonId: settings.seasonId,
        subject: `Daily reminders for ${tomorrow}`,
        body: settings.reminderTemplate,
        recipientGroup: `Daily Reminder (auto)`,
        recipientCount: recipients.length,
        recipientList: recipients.join(", "),
        fromName: settings.fromName,
        replyTo: settings.replyTo || "",
      });
    }

    seasonResults.push({
      seasonId: settings.seasonId,
      emailsSent,
      smsSent,
      errors,
      recipients,
    });
  }

  return NextResponse.json({
    success: true,
    currentHourEt: currentHour,
    tomorrow,
    force,
    seasons: seasonResults,
  });
}
