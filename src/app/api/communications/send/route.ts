import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players, emailSettings, emailLog } from "@/db/schema";
import { eq, and, ne, isNotNull } from "drizzle-orm";
import {
  sendBulkEmails,
  sendBulkSms,
  validateEmailConfig,
  type Recipient,
  type SmsRecipient,
} from "@/lib/email";

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
    };
    const {
      seasonId,
      recipientGroup,
      subject,
      body: messageBody,
      fromName,
      replyTo,
      channel = "both",
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

    const database = await db();

    // Load settings for test phone/carrier
    const settingsRows = await database
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.seasonId, seasonId));
    const settings = settingsRows[0];

    let emailRecipients: Recipient[] = [];
    let smsRecipients: SmsRecipient[] = [];
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

      if (channel === "email") {
        if (hasTestEmail) emailRecipients.push({ name: "Test", email: testEmail });
      } else if (channel === "sms") {
        if (hasTestSms) {
          smsRecipients.push({ name: "Test", phone: testPhone, carrier: testCarrier });
        } else if (hasTestEmail) {
          emailRecipients.push({ name: "Test (SMS fallback)", email: testEmail });
        }
      } else {
        // "both" — send via both channels
        if (hasTestEmail) emailRecipients.push({ name: "Test", email: testEmail });
        if (hasTestSms) smsRecipients.push({ name: "Test", phone: testPhone, carrier: testCarrier });
      }

      recipientNamesForLog.push("Test");
    } else {
      // Query active players (include phone + carrier)
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
          and(
            eq(players.seasonId, seasonId),
            eq(players.isActive, true)
          )
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
          if (hasEmail) emailRecipients.push({ name, email: p.email! });
        } else if (channel === "sms") {
          if (hasSms) {
            smsRecipients.push({ name, phone: p.cellNumber!, carrier: p.carrier! });
          } else if (hasEmail) {
            // Fallback to email when no SMS configured
            emailRecipients.push({ name, email: p.email! });
          }
        } else {
          // "both" — send to both channels where available (may overlap)
          if (hasEmail) emailRecipients.push({ name, email: p.email! });
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

    // Send
    const emailResult = await sendBulkEmails(emailRecipients, subject, messageBody, fromName, replyTo);
    let smsResult = { sent: 0, smsSent: 0, errors: [] as string[], skipped: [] as string[], recipients: [] as string[] };
    if (smsRecipients.length > 0) {
      smsResult = await sendBulkSms(smsRecipients, messageBody, fromName);
    }

    const totalSent = emailResult.sent + smsResult.smsSent;
    const channelLabel =
      channel === "email" ? "Email" : channel === "sms" ? "Text" : "Email+Text";

    // Log the send
    await database.insert(emailLog).values({
      seasonId,
      subject,
      body: messageBody,
      recipientGroup: `${recipientGroup} (${channelLabel})`,
      recipientCount: totalSent,
      recipientList: recipientNamesForLog.join(", "),
      fromName,
      replyTo: replyTo || "",
    });

    const warnings = [
      ...emailResult.skipped,
      ...emailResult.errors,
      ...smsResult.skipped,
      ...smsResult.errors,
    ];

    return NextResponse.json({
      success: true,
      recipientCount: totalSent,
      emailsSent: emailResult.sent,
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
