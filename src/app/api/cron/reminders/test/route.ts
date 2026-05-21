import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import {
  emailSettings,
  emailTemplates,
  games,
  gameAssignments,
  players,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sendEmail, sendBulkSms, validateEmailConfig } from "@/lib/email";

/**
 * POST /api/cron/reminders/test
 * Body: { seasonId, playerId }
 *
 * Manually fires ONE reminder to the selected player using the same logic
 * as the daily cron. If the player has an upcoming normal game (any date),
 * we use that game's real partners and details. Otherwise we substitute
 * placeholder values so the admin can preview the message formatting
 * before games are generated for the season.
 *
 * Returns the rendered subject + body plus per-channel results.
 */

function substitute(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_full, name: string) => {
    const key = name.toLowerCase();
    const v = ctx[key];
    return v !== undefined ? v : `{${name}}`;
  });
}

function formatTime(hhmm: string): string {
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
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) return yyyymmdd;
  return new Date(`${yyyymmdd}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId?: number;
      playerId?: number;
    };
    if (!body.seasonId || !body.playerId) {
      return NextResponse.json(
        { error: "seasonId and playerId required" },
        { status: 400 }
      );
    }

    const database = await db();

    const [settings] = await database
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.seasonId, body.seasonId));

    if (!settings) {
      return NextResponse.json(
        { error: "Email settings not found for this season" },
        { status: 404 }
      );
    }

    const configError = validateEmailConfig();
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 500 });
    }

    const [player] = await database
      .select()
      .from(players)
      .where(eq(players.id, body.playerId));

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Try to find the player's first upcoming normal game (any date)
    const upcoming = await database
      .select({
        gameId: games.id,
        date: games.date,
        startTime: games.startTime,
        courtNumber: games.courtNumber,
        group: games.group,
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, body.seasonId),
          eq(games.status, "normal"),
          eq(gameAssignments.playerId, body.playerId)
        )
      )
      .orderBy(games.date, games.startTime)
      .limit(1);

    let gameMeta: {
      date: string;
      startTime: string;
      courtNumber: number;
      group: string;
    };
    let partners: string;
    let usedSample = false;

    if (upcoming.length > 0) {
      const g = upcoming[0];
      gameMeta = {
        date: g.date,
        startTime: g.startTime,
        courtNumber: g.courtNumber,
        group: g.group,
      };
      // Load the other 3 players in that game
      const roster = await database
        .select({
          playerId: players.id,
          firstName: players.firstName,
          lastName: players.lastName,
          slotPosition: gameAssignments.slotPosition,
        })
        .from(gameAssignments)
        .innerJoin(players, eq(gameAssignments.playerId, players.id))
        .where(eq(gameAssignments.gameId, g.gameId));

      partners = roster
        .filter((p) => p.playerId !== body.playerId)
        .sort((a, b) => a.slotPosition - b.slotPosition)
        .map((p) => `${p.firstName} ${p.lastName}`)
        .join(", ");
      if (!partners) partners = "(no other players yet)";
    } else {
      // Use placeholder values so admin can preview the message format
      // before any games are generated for the season.
      usedSample = true;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      gameMeta = {
        date: tomorrow.toISOString().slice(0, 10),
        startTime: "09:00",
        courtNumber: 1,
        group: "dons",
      };
      partners = "Sample Player 1, Sample Player 2, Sample Player 3";
    }

    const ctx: Record<string, string> = {
      firstname: player.firstName,
      lastname: player.lastName,
      name: `${player.firstName} ${player.lastName}`,
      date: formatDate(gameMeta.date),
      time: formatTime(gameMeta.startTime),
      court: String(gameMeta.courtNumber),
      partners,
      group: gameMeta.group,
    };

    // Pick the template (saved one if linked, else the inline fallback)
    let templateSubject = `Game reminder — tomorrow`;
    let templateBody = settings.reminderTemplate;
    if (settings.reminderTemplateId) {
      const [tpl] = await database
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, settings.reminderTemplateId));
      if (tpl) {
        templateSubject = tpl.subject;
        templateBody = tpl.body;
      }
    }
    const bodyText = substitute(templateBody, ctx);
    const subject =
      substitute(templateSubject, ctx) + (usedSample ? " (TEST)" : "");

    const hasEmail = !!(player.email && player.email.trim());
    const hasSms = !!(player.cellNumber && player.carrier);

    if (!hasEmail && !hasSms) {
      return NextResponse.json(
        {
          error:
            "Selected player has no email and no phone+carrier configured.",
          rendered: { subject, body: bodyText, ctx },
        },
        { status: 400 }
      );
    }

    let emailResult: { success: boolean; error?: string } | undefined;
    let smsResult: { sent: number; errors: string[] } | undefined;
    let smsFallbackTriggered = false;

    const ch = settings.reminderChannel || "both";

    const doEmail = async () => {
      const r = await sendEmail({
        to: player.email!,
        subject,
        text: bodyText,
        fromName: settings.fromName,
        replyTo: settings.replyTo || undefined,
      });
      emailResult = { success: r.success, error: r.error };
      return r.success;
    };
    const doSms = async () => {
      const r = await sendBulkSms(
        [
          {
            name: ctx.name,
            phone: player.cellNumber!,
            carrier: player.carrier!,
          },
        ],
        bodyText,
        settings.fromName
      );
      smsResult = { sent: r.smsSent, errors: r.errors };
      return r.smsSent > 0;
    };

    if (ch === "email") {
      if (hasEmail) await doEmail();
    } else if (ch === "sms") {
      if (hasSms) await doSms();
      else if (hasEmail) await doEmail();
    } else if (ch === "sms-fallback") {
      if (hasSms) {
        const ok = await doSms();
        if (!ok && hasEmail) {
          smsFallbackTriggered = true;
          await doEmail();
        }
      } else if (hasEmail) {
        await doEmail();
      }
    } else {
      // "both" — current behavior
      if (hasEmail) await doEmail();
      if (hasSms) await doSms();
    }

    return NextResponse.json({
      success: true,
      usedSample,
      channelUsed: ch,
      smsFallbackTriggered,
      sentTo: {
        name: ctx.name,
        email: hasEmail ? player.email : null,
        sms: hasSms ? `${player.cellNumber} (${player.carrier})` : null,
      },
      rendered: { subject, body: bodyText },
      emailResult,
      smsResult,
    });
  } catch (err) {
    console.error("[cron/reminders/test] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
