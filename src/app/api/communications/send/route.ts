import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players, emailSettings, emailLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  sendBulkEmails,
  sendBulkSms,
  sendEmail,
  validateEmailConfig,
  type Recipient,
  type SmsRecipient,
  type EmailAttachment,
} from "@/lib/email";
import { getPlayerIdsBelowStandardDeposit } from "@/lib/owesDeposit";
import { loadAccountSummariesForSeason } from "@/lib/loadAccountSummaries";
import {
  buildContext,
  substituteTemplate,
  templateHasVariables,
} from "@/lib/templateSubstitute";
import type { AccountSummary } from "@/lib/playerAccountSummary";

interface EmailRecipientWithPlayer {
  name: string;
  email: string;
  playerId: number | null; // null for Test recipient when no match
}

/**
 * Build the per-recipient calendar-link block appended to the plain-text body.
 * Uses the landing page URL (https) — calendar apps will open it and the page
 * auto-redirects to webcal:// to initiate a subscription.
 */
function buildLinkBlockText(landingUrl: string): string {
  return [
    "",
    "",
    "--",
    "Add your personal Brooklake Tennis calendar to your phone or computer:",
    landingUrl,
    "",
    'Click the link above. A separate "Brooklake Tennis" calendar will be added to your calendar app, which you can turn on or off without affecting your other calendars. It updates automatically if the schedule changes.',
  ].join("\n");
}

/**
 * Build the HTML email body with a clickable "Subscribe" button that points to
 * the landing page (https). The landing page then redirects to webcal:// to
 * trigger the calendar subscription dialog. We use an https link in the email
 * because Gmail and some other clients strip or sanitize webcal:// hrefs.
 */
function buildHtmlBody(bodyText: string, landingUrl: string): string {
  const escapedBody = bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;max-width:600px;">
  <div>${escapedBody}</div>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
  <div>
    <p style="margin:0 0 12px 0;font-weight:600;">Your personal Brooklake Tennis calendar</p>
    <p style="margin:0 0 16px 0;">
      <a href="${landingUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">
        Subscribe in Calendar
      </a>
    </p>
    <p style="margin:0;color:#475569;">
      Click the button to add a separate <strong>Brooklake Tennis</strong> calendar to your phone or computer.
      It can be turned on or off without affecting your other calendars, and it updates automatically if the schedule changes.
    </p>
  </div>
</div>`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId: number;
      recipientGroup: string;
      subject: string;
      body: string;
      fromName: string;
      replyTo: string;
      channel?: "email" | "sms" | "both";
      attachPersonalSchedule?: boolean; // kept for UI compat; means "append calendar link"
      testAsPlayerId?: number | null;
      selectedPlayerId?: number | null; // deprecated — use selectedPlayerIds
      selectedPlayerIds?: number[];
      icsFirstEventOnly?: boolean;
      attachments?: Array<{
        filename: string;
        contentBase64: string;
        contentType?: string;
      }>;
    };
    const {
      seasonId,
      recipientGroup,
      subject,
      body: messageBody,
      fromName,
      replyTo,
      channel = "both",
      attachPersonalSchedule = false,
      testAsPlayerId = null,
      selectedPlayerId = null,
      selectedPlayerIds = [],
      icsFirstEventOnly = false,
      attachments: rawAttachments = [],
    } = body;

    // Convert incoming base64 attachments to Nodemailer EmailAttachment shape
    // and enforce a total size cap (~20 MB post-decode).
    const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
    let emailAttachments: EmailAttachment[] | undefined;
    if (rawAttachments.length > 0) {
      let totalBytes = 0;
      emailAttachments = rawAttachments.map((a) => {
        const buf = Buffer.from(a.contentBase64, "base64");
        totalBytes += buf.length;
        return {
          filename: a.filename,
          content: buf,
          contentType: a.contentType || "application/octet-stream",
        };
      });
      if (totalBytes > MAX_TOTAL_BYTES) {
        return NextResponse.json(
          {
            error: `Attachments too large (${(totalBytes / 1024 / 1024).toFixed(1)} MB). Max 20 MB.`,
          },
          { status: 413 }
        );
      }
    }

    if (!seasonId || !subject || !messageBody) {
      return NextResponse.json(
        { error: "seasonId, subject, and body are required" },
        { status: 400 }
      );
    }

    const configError = validateEmailConfig();
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 500 });
    }

    const includeCalendarLink = attachPersonalSchedule && channel !== "sms";

    // Compute the base URL for webcal links from the incoming request.
    // Replace the scheme with `webcal://` so calendar apps auto-subscribe.
    // Prefer the stable public site URL (e.g. https://scheduler.teich.net) over the
    // per-deployment vercel.app URL. Calendar subscribers keep using the same URL even
    // after redeploys, and the custom domain is the one configured for public access.
    const origin =
      process.env.PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : new URL(request.url).origin);
    const webcalBase = origin.replace(/^https?:\/\//, "webcal://");

    const database = await db();

    // Load settings for test phone/carrier
    const settingsRows = await database
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.seasonId, seasonId));
    const settings = settingsRows[0];

    const emailRecipients: EmailRecipientWithPlayer[] = [];
    type LocalSmsRecipient = SmsRecipient & { playerId: number | null };
    const smsRecipients: LocalSmsRecipient[] = [];
    const recipientNamesForLog: string[] = [];

    if (recipientGroup === "Test") {
      const testEmail = settings?.testEmail || "";
      const testPhone = settings?.testPhone || "";
      const testCarrier = settings?.testCarrier || "";
      const hasTestEmail = !!testEmail;
      const hasTestSms = !!(testPhone && testCarrier);

      if (!hasTestEmail && !hasTestSms) {
        return NextResponse.json(
          { error: "No test email or phone configured. Set one in Settings." },
          { status: 400 }
        );
      }

      // Resolve which player to reference for personalisation + (optional)
      // calendar link. Priority: explicit testAsPlayerId from the client →
      // email match → null. We resolve this UNCONDITIONALLY (not gated on
      // includeCalendarLink) so template variables like {firstName} render
      // correctly in test sends even without a calendar link.
      let testPlayerId: number | null = null;
      if (testAsPlayerId != null) {
        testPlayerId = testAsPlayerId;
      } else if (hasTestEmail) {
        const testPlayerRow = await database
          .select({ id: players.id })
          .from(players)
          .where(and(eq(players.seasonId, seasonId), eq(players.email, testEmail)))
          .limit(1);
        if (testPlayerRow[0]) testPlayerId = testPlayerRow[0].id;
      }

      if (channel === "email") {
        if (hasTestEmail) emailRecipients.push({ name: "Test", email: testEmail, playerId: testPlayerId });
      } else if (channel === "sms") {
        if (hasTestSms) {
          smsRecipients.push({ name: "Test", phone: testPhone, carrier: testCarrier, playerId: testPlayerId });
        } else if (hasTestEmail) {
          emailRecipients.push({ name: "Test (SMS fallback)", email: testEmail, playerId: testPlayerId });
        }
      } else {
        // "both"
        if (hasTestEmail) emailRecipients.push({ name: "Test", email: testEmail, playerId: testPlayerId });
        if (hasTestSms) smsRecipients.push({ name: "Test", phone: testPhone, carrier: testCarrier, playerId: testPlayerId });
      }

      recipientNamesForLog.push("Test");
    } else {
      // Query active players
      const allPlayers = await database
        .select({
          id: players.id,
          firstName: players.firstName,
          lastName: players.lastName,
          email: players.email,
          cellNumber: players.cellNumber,
          carrier: players.carrier,
          contractedFrequency: players.contractedFrequency,
        })
        .from(players)
        .where(
          and(eq(players.seasonId, seasonId), eq(players.isActive, true))
        );

      // Filter by group
      let filtered = allPlayers;
      if (recipientGroup === "Contract Players") {
        filtered = allPlayers.filter((p) => p.contractedFrequency !== "0");
      } else if (recipientGroup === "Subs") {
        filtered = allPlayers.filter((p) => p.contractedFrequency === "0");
      } else if (recipientGroup === "Owes Deposit") {
        const owingIds = await getPlayerIdsBelowStandardDeposit(seasonId);
        filtered = allPlayers.filter((p) => owingIds.has(p.id));
        if (filtered.length === 0) {
          return NextResponse.json(
            { error: "No contract players currently owe their standard deposit." },
            { status: 400 }
          );
        }
      } else if (recipientGroup === "Player" || recipientGroup === "Players") {
        // Prefer the new array param; fall back to the legacy single-id param
        const ids: number[] =
          selectedPlayerIds && selectedPlayerIds.length > 0
            ? selectedPlayerIds
            : selectedPlayerId != null
              ? [selectedPlayerId]
              : [];
        if (ids.length === 0) {
          return NextResponse.json(
            { error: "No players selected." },
            { status: 400 }
          );
        }
        const idSet = new Set(ids);
        filtered = allPlayers.filter((p) => idSet.has(p.id));
        if (filtered.length === 0) {
          return NextResponse.json(
            { error: "Selected players not found or not active." },
            { status: 400 }
          );
        }
      }

      // Build email / SMS recipient lists based on channel
      for (const p of filtered) {
        const name = `${p.firstName} ${p.lastName}`;
        const hasEmail = !!(p.email && p.email.trim());
        const hasSms = !!(p.cellNumber && p.carrier);

        if (channel === "email") {
          if (hasEmail) emailRecipients.push({ name, email: p.email!, playerId: p.id });
        } else if (channel === "sms") {
          if (hasSms) {
            smsRecipients.push({ name, phone: p.cellNumber!, carrier: p.carrier!, playerId: p.id });
          } else if (hasEmail) {
            emailRecipients.push({ name, email: p.email!, playerId: p.id });
          }
        } else {
          if (hasEmail) emailRecipients.push({ name, email: p.email!, playerId: p.id });
          if (hasSms) smsRecipients.push({ name, phone: p.cellNumber!, carrier: p.carrier!, playerId: p.id });
        }
        if (hasEmail || hasSms) recipientNamesForLog.push(name);
      }
    }

    if (emailRecipients.length === 0 && smsRecipients.length === 0) {
      return NextResponse.json(
        { error: "No recipients with valid email or SMS setup found in this group." },
        { status: 400 }
      );
    }

    // --- Template-variable substitution ---
    // If subject or body contains {tokens}, load per-player account summaries
    // and personalise per recipient. Falls back to the bulk-identical-text
    // path when no variables are used.
    const needsSubstitution =
      templateHasVariables(subject) || templateHasVariables(messageBody);

    let summariesByPlayer: Map<number, AccountSummary> | null = null;
    if (needsSubstitution) {
      try {
        const loaded = await loadAccountSummariesForSeason(seasonId);
        summariesByPlayer = loaded.byPlayerId;
      } catch (err) {
        console.error("[send] failed to load account summaries:", err);
      }
    }
    const allUnknownTokens = new Set<string>();

    /**
     * Personalise the subject + body for one recipient. When no variables are
     * present, returns the originals unchanged (free path). When a recipient
     * has no account summary (sub with no games, etc.), variables that depend
     * on accounting fields render as their literal token so the admin can
     * notice the gap.
     */
    function personalize(playerId: number | null): {
      subject: string;
      text: string;
    } {
      if (!needsSubstitution) {
        return { subject, text: messageBody };
      }
      const summary =
        playerId != null && summariesByPlayer
          ? summariesByPlayer.get(playerId) ?? null
          : null;
      if (!summary) {
        return { subject, text: messageBody };
      }
      const ctx = buildContext(summary);
      const sub = substituteTemplate(subject, ctx);
      const txt = substituteTemplate(messageBody, ctx);
      sub.unknownTokens.forEach((t) => allUnknownTokens.add(t));
      txt.unknownTokens.forEach((t) => allUnknownTokens.add(t));
      return { subject: sub.text, text: txt.text };
    }

    // --- Send emails ---
    let emailsSent = 0;
    const emailErrors: string[] = [];
    const emailSkipped: string[] = [];
    const linkWarnings: string[] = [];

    if (includeCalendarLink && emailRecipients.length > 0) {
      // Per-recipient: ensure each target player has an ics_token, then append
      // a per-player webcal link to the body AND build an HTML version so the
      // link is actually clickable in email clients like Gmail that don't
      // auto-linkify webcal:// URLs in plain text.
      for (const r of emailRecipients) {
        const { subject: perSubject, text: personalisedBody } = personalize(
          r.playerId
        );
        let perRecipientText = personalisedBody;
        let perRecipientHtml: string | undefined;

        if (r.playerId != null) {
          // Ensure this player has an ics_token
          const [row] = await database
            .select({ token: players.icsToken })
            .from(players)
            .where(eq(players.id, r.playerId))
            .limit(1);

          let token = row?.token ?? null;
          if (!token) {
            token = randomBytes(16).toString("hex"); // 32 hex chars, unguessable
            await database
              .update(players)
              .set({ icsToken: token })
              .where(eq(players.id, r.playerId));
          }

          const suffix = icsFirstEventOnly ? "?preview=1" : "";
          // Landing page (https) that redirects to webcal:// — works even in
          // email clients that strip webcal:// hrefs.
          const landingUrl = `${origin}/calendar/subscribe/${token}${suffix}`;
          perRecipientText = personalisedBody + buildLinkBlockText(landingUrl);
          perRecipientHtml = buildHtmlBody(personalisedBody, landingUrl);
        } else {
          linkWarnings.push(`${r.name}: no matching player — sent without calendar link`);
        }

        const result = await sendEmail({
          to: r.email,
          subject: perSubject,
          text: perRecipientText,
          html: perRecipientHtml,
          fromName,
          replyTo,
          attachments: emailAttachments,
        });
        if (result.success) {
          emailsSent++;
        } else {
          emailErrors.push(`${r.name}: ${result.error}`);
        }
      }
    } else if (emailRecipients.length > 0) {
      if (needsSubstitution) {
        // Per-recipient personalised path — slightly slower than bulk but
        // each email gets its own substituted subject + body.
        for (const r of emailRecipients) {
          const { subject: perSubject, text: perText } = personalize(r.playerId);
          const result = await sendEmail({
            to: r.email,
            subject: perSubject,
            text: perText,
            fromName,
            replyTo,
            attachments: emailAttachments,
          });
          if (result.success) {
            emailsSent++;
          } else {
            emailErrors.push(`${r.name}: ${result.error}`);
          }
        }
      } else {
        // Bulk path: identical body for everyone.
        const plainRecipients: Recipient[] = emailRecipients.map((r) => ({
          name: r.name,
          email: r.email,
        }));
        const bulkResult = await sendBulkEmails(
          plainRecipients,
          subject,
          messageBody,
          fromName,
          replyTo,
          emailAttachments
        );
        emailsSent = bulkResult.sent;
        emailErrors.push(...bulkResult.errors);
        emailSkipped.push(...bulkResult.skipped);
      }
    }

    // --- Send SMS (no calendar link — SMS can't usefully receive one anyway) ---
    let smsResult = {
      sent: 0,
      smsSent: 0,
      errors: [] as string[],
      skipped: [] as string[],
      recipients: [] as string[],
    };
    if (smsRecipients.length > 0) {
      if (needsSubstitution) {
        // Per-recipient SMS personalisation
        for (const r of smsRecipients) {
          const { text: perText } = personalize(r.playerId);
          const partial = await sendBulkSms(
            [{ name: r.name, phone: r.phone, carrier: r.carrier }],
            perText,
            fromName
          );
          smsResult.smsSent += partial.smsSent;
          smsResult.errors.push(...partial.errors);
          smsResult.skipped.push(...partial.skipped);
          smsResult.recipients.push(...partial.recipients);
        }
      } else {
        const stripped = smsRecipients.map((r) => ({
          name: r.name,
          phone: r.phone,
          carrier: r.carrier,
        }));
        smsResult = await sendBulkSms(stripped, messageBody, fromName);
      }
    }

    const totalSent = emailsSent + smsResult.smsSent;
    const channelLabel =
      channel === "email" ? "Email" : channel === "sms" ? "Text" : "Email+Text";
    const logGroupLabel = includeCalendarLink
      ? `${recipientGroup} (${channelLabel}+Cal)`
      : `${recipientGroup} (${channelLabel})`;

    await database.insert(emailLog).values({
      seasonId,
      subject,
      body: messageBody,
      recipientGroup: logGroupLabel,
      recipientCount: totalSent,
      recipientList: recipientNamesForLog.join(", "),
      fromName,
      replyTo: replyTo || "",
    });

    const warnings = [
      ...emailSkipped,
      ...emailErrors,
      ...linkWarnings,
      ...smsResult.skipped,
      ...smsResult.errors,
      ...(allUnknownTokens.size > 0
        ? [
            `Unknown template tokens left as literal text: ${[...allUnknownTokens]
              .map((t) => `{${t}}`)
              .join(", ")}`,
          ]
        : []),
    ];

    return NextResponse.json({
      success: true,
      recipientCount: totalSent,
      emailsSent,
      smsSent: smsResult.smsSent,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    console.error("[communications/send POST] error:", err);
    return NextResponse.json(
      { error: "Failed to send messages" },
      { status: 500 }
    );
  }
}
