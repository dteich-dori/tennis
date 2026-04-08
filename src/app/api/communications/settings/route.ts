import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { emailSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

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
    };
    const {
      seasonId,
      fromName,
      replyTo,
      testEmail,
      testPhone = "",
      testCarrier = "",
      questionnaireUrl,
    } = body;

    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();

    // Check if settings exist for this season
    const existing = await database
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.seasonId, seasonId));

    if (existing.length > 0) {
      // Update
      const result = await database
        .update(emailSettings)
        .set({ fromName, replyTo, testEmail, testPhone, testCarrier, questionnaireUrl })
        .where(eq(emailSettings.seasonId, seasonId))
        .returning();
      return NextResponse.json(result[0]);
    } else {
      // Insert
      const result = await database
        .insert(emailSettings)
        .values({ seasonId, fromName, replyTo, testEmail, testPhone, testCarrier, questionnaireUrl })
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
