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
} from "@/lib/email";

interface EmailRecipientWithPlayer {
  name: string;
  email: string;
  playerId: number | null; // null for Test recipient when no match
}

/**
 * Build the per-recipient calendar-link block appended to the plain-text body.
 */
function buildLinkBlockText(webcalUrl: string, httpsUrl: string): string {
  return [
    "",
    "",
    "--",
    "Your personal Brooklake Tennis calendar:",
    webcalUrl,
    "",
    'Click the link above to subscribe. The calendar will appear in your calendar app as "Brooklake Tennis" and can be turned on/off independently from your other calendars. It auto-updates if the schedule changes.',
    "",
    "If that link isn't clickable in your email client, copy and paste this address into your calendar app's \"Subscribe to Calendar\" option:",
    httpsUrl,
  ].join("\n");
}

/**
 * Build the HTML email body with clickable webcal:// link.
 * Simple structure: the admin-composed body (with newlines converted to <br>)
 * followed by a divider and a prominent "Subscribe" button-style link.
 */
function buildHtmlBody(bodyText: string, webcalUrl: string, httpsUrl: string): string {
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
      <a href="${webcalUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:600;">
        Subscribe in Calendar
      </a>
    </p>
    <p style="margin:0 0 8px 0;color:#475569;">
      Clicking the button above will add a new <strong>Brooklake Tennis</strong> calendar to your calendar app.
      You can toggle it on and off independently from your personal calendar, and it will auto-update if the schedule changes.
    </p>
    <p style="margin:16px 0 4px 0;color:#64748b;font-size:12px;">
      If the button doesn't work in your email client, copy and paste this address into your calendar app's "Subscribe to Calendar" option:
    </p>
    <p style="margin:0;color:#64748b;font-size:12px;word-break:break-all;font-family:Menlo,Consolas,monospace;">
      ${httpsUrl}
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
      icsFirstEventOnly?: boolean;
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
      icsFirstEventOnly = false,
    } = body;

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
    const smsRecipients: SmsRecipient[] = [];
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

      // For test + calendar link, resolve which player's schedule to reference.
      // Priority: explicit testAsPlayerId from the client → email match → null.
      let testPlayerId: number | null = null;
      if (includeCalendarLink) {
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
      }

      if (channel === "email") {
        if (hasTestEmail) emailRecipients.push({ name: "Test", email: testEmail, playerId: testPlayerId });
      } else if (channel === "sms") {
        if (hasTestSms) {
          smsRecipients.push({ name: "Test", phone: testPhone, carrier: testCarrier });
        } else if (hasTestEmail) {
          emailRecipients.push({ name: "Test (SMS fallback)", email: testEmail, playerId: testPlayerId });
        }
      } else {
        // "both"
        if (hasTestEmail) emailRecipients.push({ name: "Test", email: testEmail, playerId: testPlayerId });
        if (hasTestSms) smsRecipients.push({ name: "Test", phone: testPhone, carrier: testCarrier });
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
            smsRecipients.push({ name, phone: p.cellNumber!, carrier: p.carrier! });
          } else if (hasEmail) {
            emailRecipients.push({ name, email: p.email!, playerId: p.id });
          }
        } else {
          if (hasEmail) emailRecipients.push({ name, email: p.email!, playerId: p.id });
          if (hasSms) smsRecipients.push({ name, phone: p.cellNumber!, carrier: p.carrier! });
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
        let perRecipientText = messageBody;
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
          const webcalUrl = `${webcalBase}/api/ics/${token}${suffix}`;
          const httpsUrl = `${origin}/api/ics/${token}${suffix}`;
          perRecipientText = messageBody + buildLinkBlockText(webcalUrl, httpsUrl);
          perRecipientHtml = buildHtmlBody(messageBody, webcalUrl, httpsUrl);
        } else {
          linkWarnings.push(`${r.name}: no matching player — sent without calendar link`);
        }

        const result = await sendEmail({
          to: r.email,
          subject,
          text: perRecipientText,
          html: perRecipientHtml,
          fromName,
          replyTo,
        });
        if (result.success) {
          emailsSent++;
        } else {
          emailErrors.push(`${r.name}: ${result.error}`);
        }
      }
    } else if (emailRecipients.length > 0) {
      // Standard bulk path: identical body for everyone.
      const plainRecipients: Recipient[] = emailRecipients.map((r) => ({
        name: r.name,
        email: r.email,
      }));
      const bulkResult = await sendBulkEmails(
        plainRecipients,
        subject,
        messageBody,
        fromName,
        replyTo
      );
      emailsSent = bulkResult.sent;
      emailErrors.push(...bulkResult.errors);
      emailSkipped.push(...bulkResult.skipped);
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
      smsResult = await sendBulkSms(smsRecipients, messageBody, fromName);
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
