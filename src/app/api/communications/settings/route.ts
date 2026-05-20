import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { emailSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_REMINDER_TEMPLATE =
  "Hi {firstName},\n\nReminder: you have a game tomorrow ({date}) at {time} on Court {court}.\n\nPartners: {partners}\n\nSee you on the courts!";

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const result = await database
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.seasonId, parseInt(seasonId)));

    if (result.length === 0) {
      // Return defaults
      return NextResponse.json({
        fromName: "Tennis Club",
        replyTo: "",
        testEmail: "",
        testPhone: "",
        testCarrier: "",
        questionnaireUrl: "",
        remindersEnabled: false,
        reminderHour: 18,
        reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
      });
    }

    return NextResponse.json(result[0]);
  } catch (err) {
    console.error("[communications/settings GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load email settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId: number;
      fromName: string;
      replyTo: string;
      testEmail: string;
      testPhone?: string;
      testCarrier?: string;
      questionnaireUrl: string;
      remindersEnabled?: boolean;
      reminderHour?: number;
      reminderTemplate?: string;
    };
    const {
      seasonId,
      fromName,
      replyTo,
      testEmail,
      testPhone = "",
      testCarrier = "",
      questionnaireUrl,
      remindersEnabled,
      reminderHour,
      reminderTemplate,
    } = body;

    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    // Clamp reminderHour to 0-23 if provided
    let safeHour: number | undefined = undefined;
    if (reminderHour !== undefined) {
      const n = Number(reminderHour);
      if (!Number.isInteger(n) || n < 0 || n > 23) {
        return NextResponse.json(
          { error: "reminderHour must be an integer 0-23" },
          { status: 400 }
        );
      }
      safeHour = n;
    }

    const database = await db();

    const existing = await database
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.seasonId, seasonId));

    if (existing.length > 0) {
      const updates: Record<string, unknown> = {
        fromName,
        replyTo,
        testEmail,
        testPhone,
        testCarrier,
        questionnaireUrl,
      };
      if (remindersEnabled !== undefined) updates.remindersEnabled = remindersEnabled;
      if (safeHour !== undefined) updates.reminderHour = safeHour;
      if (reminderTemplate !== undefined) updates.reminderTemplate = reminderTemplate;

      const result = await database
        .update(emailSettings)
        .set(updates)
        .where(eq(emailSettings.seasonId, seasonId))
        .returning();
      return NextResponse.json(result[0]);
    } else {
      const result = await database
        .insert(emailSettings)
        .values({
          seasonId,
          fromName,
          replyTo,
          testEmail,
          testPhone,
          testCarrier,
          questionnaireUrl,
          remindersEnabled: remindersEnabled ?? false,
          reminderHour: safeHour ?? 18,
          reminderTemplate: reminderTemplate ?? DEFAULT_REMINDER_TEMPLATE,
        })
        .returning();
      return NextResponse.json(result[0], { status: 201 });
    }
  } catch (err) {
    console.error("[communications/settings PUT] error:", err);
    return NextResponse.json(
      { error: "Failed to save email settings" },
      { status: 500 }
    );
  }
}
