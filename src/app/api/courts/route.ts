import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { courtSchedules } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const result = await database
      .select()
      .from(courtSchedules)
      .where(eq(courtSchedules.seasonId, parseInt(seasonId)));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[courts GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load courts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { seasonId: number; dayOfWeek: number; courtNumber: number; startTime: string; isSolo?: boolean };
    const { seasonId, dayOfWeek, courtNumber, startTime, isSolo } = body;

    if (!seasonId) {
      return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    }
    if (typeof dayOfWeek !== "number" || dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json({ error: "dayOfWeek must be 0-6" }, { status: 400 });
    }
    if (typeof courtNumber !== "number" || courtNumber < 1 || courtNumber > 6) {
      return NextResponse.json({ error: "courtNumber must be 1-6" }, { status: 400 });
    }
    if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
      return NextResponse.json({ error: "startTime must be in HH:MM format" }, { status: 400 });
    }

    const database = await db();

    // Check for duplicate: same day + time + court number
    const existing = await database
      .select()
      .from(courtSchedules)
      .where(
        and(
          eq(courtSchedules.seasonId, seasonId),
          eq(courtSchedules.dayOfWeek, dayOfWeek),
          eq(courtSchedules.startTime, startTime),
          eq(courtSchedules.courtNumber, courtNumber)
        )
      );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "A court slot with this day, time, and court number already exists." },
        { status: 409 }
      );
    }

    const result = await database
      .insert(courtSchedules)
      .values({ seasonId, dayOfWeek, courtNumber, startTime, isSolo: isSolo ?? false })
      .returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    console.error("[courts POST] error:", err);
    return NextResponse.json(
      { error: "Failed to create court slot" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { id: number; dayOfWeek: number; courtNumber: number; startTime: string; isSolo: boolean };
    const { id, dayOfWeek, courtNumber, startTime, isSolo } = body;

    const database = await db();

    // Look up the record being edited to get its seasonId
    const current = await database
      .select()
      .from(courtSchedules)
      .where(eq(courtSchedules.id, id));

    if (current.length === 0) {
      return NextResponse.json({ error: "Court slot not found" }, { status: 404 });
    }

    // Check for duplicate (excluding the record being edited, scoped to same season)
    const existing = await database
      .select()
      .from(courtSchedules)
      .where(
        and(
          eq(courtSchedules.seasonId, current[0].seasonId),
          eq(courtSchedules.dayOfWeek, dayOfWeek),
          eq(courtSchedules.startTime, startTime),
          eq(courtSchedules.courtNumber, courtNumber)
        )
      );

    if (existing.length > 0 && existing[0].id !== id) {
      return NextResponse.json(
        { error: "A court slot with this day, time, and court number already exists." },
        { status: 409 }
      );
    }

    const result = await database
      .update(courtSchedules)
      .set({ dayOfWeek, courtNumber, startTime, isSolo })
      .where(eq(courtSchedules.id, id))
      .returning();

    return NextResponse.json(result[0]);
  } catch (err) {
    console.error("[courts PUT] error:", err);
    return NextResponse.json(
      { error: "Failed to update court slot" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const database = await db();
    await database.delete(courtSchedules).where(eq(courtSchedules.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[courts DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to delete court slot" },
      { status: 500 }
    );
  }
}
