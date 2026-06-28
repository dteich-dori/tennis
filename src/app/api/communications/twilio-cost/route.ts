import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { emailLog, seasons } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/communications/twilio-cost?seasonId=N
 *
 * Returns SMS-channel send statistics pulled from the email_log table so
 * the Twilio Cost Estimate page can compute totals. The log records each
 * send BATCH (not each individual message), with the channel encoded into
 * the recipientGroup label, so we parse that label to identify SMS
 * activity and use recipientCount as a proxy for message count.
 *
 * Response:
 *   {
 *     seasonStartDate: "2026-09-14",
 *     monthsElapsed: 7.3,
 *     smsOnlyCount: 12,    // recipients of "Text-only" sends
 *     dualSendCount: 4,    // recipients of "Email+Text" sends (counted once)
 *     fallbackCount: 1,    // recipients of "Text→Email" sends (mostly SMS first)
 *     estimatedSmsSegments: 17,  // sum of above (best-effort)
 *     batches: [...]       // list of batches for the breakdown table
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }
    const sid = parseInt(seasonId);
    const database = await db();

    const [season] = await database
      .select()
      .from(seasons)
      .where(eq(seasons.id, sid));
    if (!season) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }

    const logs = await database
      .select()
      .from(emailLog)
      .where(eq(emailLog.seasonId, sid));

    // Categorise each batch by its channel label.
    let smsOnlyCount = 0;
    let dualSendCount = 0;
    let fallbackCount = 0;
    const batches: {
      id: number;
      sentAt: string;
      recipientGroup: string;
      recipientCount: number;
      channel: "text" | "text+email" | "text→email" | "email" | "other";
      estimatedSmsCount: number;
    }[] = [];

    for (const row of logs) {
      const label = row.recipientGroup;
      let channel: "text" | "text+email" | "text→email" | "email" | "other";
      let estimatedSmsCount = 0;
      // Check most-specific patterns first
      if (label.includes("(Text→Email")) {
        channel = "text→email";
        // Roughly half-and-half — most went via SMS first, some fell to email
        estimatedSmsCount = row.recipientCount;
        fallbackCount += row.recipientCount;
      } else if (label.includes("(Email+Text") || label.includes("Email+Text+Cal")) {
        channel = "text+email";
        // Both channels — assume each recipient got 1 SMS (some may not have phone)
        estimatedSmsCount = row.recipientCount;
        dualSendCount += row.recipientCount;
      } else if (label.includes("(Text)") || label.includes("(Text+Cal)")) {
        channel = "text";
        estimatedSmsCount = row.recipientCount;
        smsOnlyCount += row.recipientCount;
      } else if (label.includes("(Email)") || label.includes("(Email+Cal)")) {
        channel = "email";
        estimatedSmsCount = 0;
      } else {
        channel = "other";
        estimatedSmsCount = 0;
      }
      batches.push({
        id: row.id,
        sentAt: row.sentAt,
        recipientGroup: row.recipientGroup,
        recipientCount: row.recipientCount,
        channel,
        estimatedSmsCount,
      });
    }
    batches.sort((a, b) => a.sentAt.localeCompare(b.sentAt));

    const estimatedSmsSegments = smsOnlyCount + dualSendCount + fallbackCount;

    // Burden months = elapsed time WITHIN the season window (start..end),
    // capped at "today" if the season hasn't ended, at season end if it has.
    // Used to attribute monthly Twilio fees to the Scheduler app only for
    // the winter portion of the year (the GamesSignup app carries summer).
    const start = new Date(season.startDate + "T00:00:00");
    const end = new Date(season.endDate + "T23:59:59");
    const today = new Date();
    const effectiveEnd = today < end ? today : end;
    const monthsElapsed = Math.max(
      0,
      (effectiveEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)
    );

    return NextResponse.json({
      seasonStartDate: season.startDate,
      seasonEndDate: season.endDate,
      monthsElapsed: Math.round(monthsElapsed * 10) / 10,
      smsOnlyCount,
      dualSendCount,
      fallbackCount,
      estimatedSmsSegments,
      batches,
    });
  } catch (err) {
    console.error("[twilio-cost GET] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
