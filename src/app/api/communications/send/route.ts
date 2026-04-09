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
 * Build the per-recipient calendar-link block appended to the email body.
 */
function buildLinkBlock(webcalUrl: string): string {
  return [
    "",
    "",
    "--",
    "Your personal Brooklake Tennis calendar:",
    webcalUrl,
    "",
    'Click the link to subscribe. The calendar will appear in your calendar app as "Brooklake Tennis" and can be turned on/off independently from your other calendars. It auto-updates if the schedule changes.',
  ].join("\n");
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
    const origin = new URL(request.url).origin; // e.g. https://tennis.vercel.app
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
      // a per-player webcal link to the body.
      for (const r of emailRecipients) {
        let perRecipientBody = messageBody;

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

          const webcalUrl = `${webcalBase}/api/ics/${token}${icsFirstEventOnly ? "?preview=1" : ""}`;
          perRecipientBody = messageBody + buildLinkBlock(webcalUrl);
        } else {
          linkWarnings.push(`${r.name}: no matching player — sent without calendar link`);
        }

        const result = await sendEmail({
          to: r.email,
          subject,
          text: perRecipientBody,
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
