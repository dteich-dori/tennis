import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import {
  players,
  playerBlockedDays,
  playerVacations,
  emailSettings,
  emailLog,
  seasons,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sendEmail } from "@/lib/email";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDate(yyyymmdd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) return yyyymmdd;
  const d = new Date(yyyymmdd + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatVacationRange(v: { startDate: string; endDate: string }): string {
  return v.startDate === v.endDate
    ? formatDate(v.startDate)
    : `${formatDate(v.startDate)} — ${formatDate(v.endDate)}`;
}

/**
 * Build the plain-text and HTML bodies of the personalized availability
 * verification email for one player. Kept as a pure function so the
 * client can call preview via dryRun and see identical output.
 */
export function buildPlayerEmail(
  _player: { firstName: string; lastName: string },
  blockedDays: number[],
  vacations: { startDate: string; endDate: string }[],
  subjectText: string,
  introText: string,
  daysPerWeek: number,
): { subject: string; text: string; html: string } {
  const subject = subjectText.trim() || "Please verify your availability";

  // Blocked days, filtered to the tennis-week days (drop Sat/Sun on a
  // 5-day week etc — a checkbox for a non-tennis day is stale and
  // shouldn't confuse the recipient).
  const tennisDays = daysPerWeek === 7
    ? [0, 1, 2, 3, 4, 5, 6]
    : daysPerWeek === 6
      ? [1, 2, 3, 4, 5, 6]
      : [1, 2, 3, 4, 5];
  const blockedSet = new Set(blockedDays);
  const blockedDayLabels = tennisDays.filter((d) => blockedSet.has(d)).map((d) => DAY_NAMES[d]);

  const vacationList = vacations.length === 0
    ? "None recorded."
    : vacations
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((v) => `  • ${formatVacationRange(v)}`)
        .join("\n");

  const blockedDaysLine = blockedDayLabels.length > 0
    ? blockedDayLabels.join(", ")
    : "None on file — you're not blocked from any tennis day.";

  const text = `${introText.trim()}

═══════════════════════════════════
YOUR CURRENT AVAILABILITY ON FILE
═══════════════════════════════════

BLOCKED DAYS OF THE WEEK:
  ${blockedDaysLine}

VACATIONS ON FILE:
${vacationList}

═══════════════════════════════════

If anything above is wrong or out of date, please reply to this
email with the corrections and I'll update your record.

Thanks,
Dori
`;

  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const vacationHtml = vacations.length === 0
    ? "<em>None recorded.</em>"
    : "<ul>" + vacations
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((v) => `<li>${escapeHtml(formatVacationRange(v))}</li>`)
        .join("") + "</ul>";

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #333; max-width: 640px;">
  <p style="white-space: pre-wrap;">${escapeHtml(introText.trim())}</p>
  <div style="border: 2px solid #d97706; background: #fff8e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
    <h3 style="margin: 0 0 12px 0; color: #92400e; font-size: 15px;">Your current availability on file</h3>
    <p style="margin: 8px 0;"><strong>Blocked days of the week:</strong><br>${escapeHtml(blockedDaysLine)}</p>
    <p style="margin: 8px 0;"><strong>Vacations on file:</strong></p>
    ${vacationHtml}
  </div>
  <p>If anything above is wrong or out of date, please reply to this email with the corrections and I&rsquo;ll update your record.</p>
  <p>Thanks,<br>Dori</p>
</div>`;

  return { subject, text, html };
}

/**
 * POST /api/communications/send-availability
 *
 * Body: {
 *   seasonId: number,
 *   introText: string,
 *   recipientGroup: "All" | "Contract" | "Subs" | "Selected",
 *   selectedPlayerIds?: number[],
 *   dryRun?: boolean,
 * }
 *
 * For each recipient, builds a personalized email containing:
 *   - the admin's intro text,
 *   - the days they can play (tennis-week days NOT in their blocked list),
 *   - the days they're blocked from,
 *   - their vacation date ranges.
 *
 * dryRun mode returns the built emails without sending, for preview.
 * On send, one emailLog row is written summarising the batch (mirroring
 * how /api/communications/send logs).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId: number;
      subject?: string;
      introText?: string;
      recipientGroup: "All" | "Contract" | "Subs" | "Selected";
      selectedPlayerIds?: number[];
      dryRun?: boolean;
    };
    const { seasonId, recipientGroup, selectedPlayerIds, dryRun } = body;
    const introText = (body.introText ?? "").trim();
    const subjectText = (body.subject ?? "").trim();
    if (!seasonId) return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    if (!introText) return NextResponse.json({ error: "introText required" }, { status: 400 });
    if (!subjectText) return NextResponse.json({ error: "subject required" }, { status: 400 });

    const database = await db();

    const [season] = await database.select().from(seasons).where(eq(seasons.id, seasonId));
    if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 });

    // Email settings — used for fromName / replyTo
    const [settings] = await database
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.seasonId, seasonId));
    const fromName = settings?.fromName ?? "Tennis Scheduler";
    const replyTo = settings?.replyTo ?? undefined;

    // Load players (respect excludedFromAutoAssign — same convention as
    // other communications — and skip anyone opted out is fine since
    // we're only sending EMAIL; SMS opt-out doesn't apply here).
    const allPlayers = await database
      .select({
        id: players.id,
        firstName: players.firstName,
        lastName: players.lastName,
        email: players.email,
        contractedFrequency: players.contractedFrequency,
      })
      .from(players)
      .where(and(eq(players.seasonId, seasonId), eq(players.isActive, true)));

    let filtered = allPlayers;
    if (recipientGroup === "Contract") {
      filtered = allPlayers.filter((p) => p.contractedFrequency !== "0");
    } else if (recipientGroup === "Subs") {
      filtered = allPlayers.filter((p) => p.contractedFrequency === "0");
    } else if (recipientGroup === "Selected") {
      const ids = new Set(selectedPlayerIds ?? []);
      if (ids.size === 0) return NextResponse.json({ error: "No players selected." }, { status: 400 });
      filtered = allPlayers.filter((p) => ids.has(p.id));
    }
    // Only players who actually have an email address can receive this.
    filtered = filtered.filter((p) => !!p.email && p.email.trim().length > 0);
    if (filtered.length === 0) {
      return NextResponse.json(
        { error: "No matching players with an email address on file." },
        { status: 400 }
      );
    }

    // Load blocked days + vacations in bulk
    const playerIds = filtered.map((p) => p.id);
    const [blockedRows, vacationRows] = await Promise.all([
      database.select().from(playerBlockedDays).where(inArray(playerBlockedDays.playerId, playerIds)),
      database.select().from(playerVacations).where(inArray(playerVacations.playerId, playerIds)),
    ]);
    const blockedByPlayer = new Map<number, number[]>();
    for (const b of blockedRows) {
      const arr = blockedByPlayer.get(b.playerId) ?? [];
      arr.push(b.dayOfWeek);
      blockedByPlayer.set(b.playerId, arr);
    }
    const vacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
    for (const v of vacationRows) {
      const arr = vacsByPlayer.get(v.playerId) ?? [];
      arr.push({ startDate: v.startDate, endDate: v.endDate });
      vacsByPlayer.set(v.playerId, arr);
    }

    const daysPerWeek = season.daysPerWeek ?? 5;

    // Dry-run: return the first built email + counts, no sends, no log.
    if (dryRun) {
      const first = filtered[0];
      const email = buildPlayerEmail(
        { firstName: first.firstName, lastName: first.lastName },
        blockedByPlayer.get(first.id) ?? [],
        vacsByPlayer.get(first.id) ?? [],
        subjectText,
        introText,
        daysPerWeek,
      );
      return NextResponse.json({
        dryRun: true,
        recipientCount: filtered.length,
        preview: {
          to: first.email,
          name: `${first.firstName} ${first.lastName}`,
          ...email,
        },
      });
    }

    // Real send
    const sent: { id: number; name: string }[] = [];
    const failed: { id: number; name: string; error: string }[] = [];
    for (const p of filtered) {
      const email = buildPlayerEmail(
        { firstName: p.firstName, lastName: p.lastName },
        blockedByPlayer.get(p.id) ?? [],
        vacsByPlayer.get(p.id) ?? [],
        subjectText,
        introText,
        daysPerWeek,
      );
      const result = await sendEmail({
        to: p.email!,
        subject: email.subject,
        text: email.text,
        html: email.html,
        fromName,
        replyTo,
      });
      if (result.success) {
        sent.push({ id: p.id, name: `${p.firstName} ${p.lastName}` });
      } else {
        failed.push({ id: p.id, name: `${p.firstName} ${p.lastName}`, error: result.error ?? "unknown" });
      }
    }

    // Log the batch — mirrors the recipientGroup label pattern of the
    // main /send route so /reports and email history stay consistent.
    const groupLabel = recipientGroup === "Selected"
      ? `Availability (Selected, ${sent.length + failed.length})`
      : `Availability (${recipientGroup})`;
    const recipientNames = [...sent, ...failed].map((r) => r.name).join(", ");
    await database.insert(emailLog).values({
      seasonId,
      subject: `Availability verification — ${sent.length} sent`,
      body: introText,
      recipientGroup: `${groupLabel} (Email)`,
      recipientCount: sent.length,
      recipientList: recipientNames,
      fromName,
      replyTo: replyTo ?? "",
    });

    return NextResponse.json({
      ok: true,
      sent: sent.length,
      failed: failed.length,
      sentPlayers: sent,
      failedPlayers: failed,
    });
  } catch (err) {
    console.error("[send-availability POST] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
