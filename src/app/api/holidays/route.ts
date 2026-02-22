import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { holidays } from "@/db/schema";
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
      .from(holidays)
      .where(eq(holidays.seasonId, parseInt(seasonId)));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[holidays GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load holidays" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { seasonId: number; date: string; name?: string };
    const { seasonId, date, name } = body;

    const database = await db();

    // Prevent duplicate holidays for same season + date
    const existing = await database
      .select()
      .from(holidays)
      .where(and(eq(holidays.seasonId, seasonId), eq(holidays.date, date)));
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "This date is already marked as a holiday." },
        { status: 409 }
      );
    }

    const result = await database
      .insert(holidays)
      .values({ seasonId, date, name: name || "" })
      .returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    console.error("[holidays POST] error:", err);
    return NextResponse.json(
      { error: "Failed to create holiday" },
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
    await database.delete(holidays).where(eq(holidays.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[holidays DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to delete holiday" },
      { status: 500 }
    );
  }
}
