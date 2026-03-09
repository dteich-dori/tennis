import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/db/getDb";
import { players, emailSettings, emailLog } from "@/db/schema";
import { eq, and, ne, isNotNull } from "drizzle-orm";

interface Recipient {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
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
    };
    const { seasonId, recipientGroup, subject, body: messageBody, fromName, replyTo } = body;

    if (!seasonId || !subject || !messageBody) {
      return NextResponse.json(
        { error: "seasonId, subject, and body are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || apiKey === "re_your_resend_api_key") {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured. Please set it in your environment variables." },
        { status: 500 }
      );
    }

    const database = await db();
    let recipients: Recipient[] = [];

    if (recipientGroup === "Test") {
      // Get test email from settings
      const settings = await database
        .select()
        .from(emailSettings)
        .where(eq(emailSettings.seasonId, seasonId));

      const testEmail = settings.length > 0 ? settings[0].testEmail : "";
      if (!testEmail) {
        return NextResponse.json(
          { error: "No test email configured. Set one in Settings." },
          { status: 400 }
        );
      }

      recipients = [{ id: 0, firstName: "Test", lastName: "Recipient", email: testEmail }];
    } else {
      // Query active players with email
      const allPlayers = await database
        .select({
          id: players.id,
          firstName: players.firstName,
          lastName: players.lastName,
          email: players.email,
          contractedFrequency: players.contractedFrequency,
        })
        .from(players)
        .where(
          and(
            eq(players.seasonId, seasonId),
            eq(players.isActive, true),
            isNotNull(players.email),
            ne(players.email, "")
          )
        );

      if (recipientGroup === "Contract Players") {
        recipients = allPlayers.filter((p) => p.contractedFrequency !== "0");
      } else if (recipientGroup === "Subs") {
        recipients = allPlayers.filter((p) => p.contractedFrequency === "0");
      } else {
        // ALL
        recipients = allPlayers;
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No recipients with email addresses found in this group." },
        { status: 400 }
      );
    }

    // Send via Resend
    const resend = new Resend(apiKey);
    const fromAddress = `${fromName} <onboarding@resend.dev>`;

    // Validate and clean email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validRecipients: typeof recipients = [];
    const skipped: string[] = [];

    for (const r of recipients) {
      if (!r.email) continue;
      const cleaned = r.email.replace(/\s/g, ""); // remove spaces
      if (emailRegex.test(cleaned)) {
        validRecipients.push({ ...r, email: cleaned });
      } else {
        skipped.push(`${r.firstName} ${r.lastName} (${r.email}): invalid email format`);
      }
    }

    // Build email list
    const emails = validRecipients.map((r) => ({
      from: fromAddress,
      to: r.email!,
      reply_to: replyTo || undefined,
      subject,
      text: messageBody,
    }));

    // Send individually so one bad email doesn't fail the whole batch
    let totalSent = 0;
    const errors: string[] = [...skipped];

    for (const email of emails) {
      const result = await resend.emails.send(email);
      if (result.error) {
        errors.push(`${email.to}: ${result.error.message}`);
      } else {
        totalSent += 1;
      }
    }

    // Log the send
    const recipientNames = recipients
      .map((r) => `${r.firstName} ${r.lastName}`)
      .join(", ");

    await database.insert(emailLog).values({
      seasonId,
      subject,
      body: messageBody,
      recipientGroup,
      recipientCount: totalSent,
      recipientList: recipientNames,
      fromName,
      replyTo: replyTo || "",
    });

    if (errors.length > 0) {
      return NextResponse.json({
        success: true,
        recipientCount: totalSent,
        warnings: errors,
      });
    }

    return NextResponse.json({
      success: true,
      recipientCount: totalSent,
    });
  } catch (err) {
    console.error("[communications/send POST] error:", err);
    return NextResponse.json(
      { error: "Failed to send emails" },
      { status: 500 }
    );
  }
}
