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

    // Build email list for batch sending
    const emails = recipients
      .filter((r) => r.email)
      .map((r) => ({
        from: fromAddress,
        to: r.email!,
        reply_to: replyTo || undefined,
        subject,
        text: messageBody,
      }));

    // Resend batch supports up to 100 emails per call
    const batchSize = 100;
    let totalSent = 0;
    const errors: string[] = [];

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);

      if (batch.length === 1) {
        // Single email - use emails.send
        const result = await resend.emails.send(batch[0]);
        if (result.error) {
          errors.push(`Failed to send to ${batch[0].to}: ${result.error.message}`);
        } else {
          totalSent += 1;
        }
      } else {
        // Batch send
        const result = await resend.batch.send(batch);
        if (result.error) {
          errors.push(`Batch error: ${result.error.message}`);
        } else {
          totalSent += batch.length;
        }
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
