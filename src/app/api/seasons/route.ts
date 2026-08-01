import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { seasons, holidays, games } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  try {
    const database = await db();
    const allSeasons = await database.select().from(seasons);
    return NextResponse.json(allSeasons);
  } catch (err) {
    console.error("[seasons GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load seasons" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { startDate: string; maxCGamesPerWeek?: number | null; maxCGamesPerWeek1x?: number | null; maxACGamesPerSeason?: number | null };
    const { startDate, maxCGamesPerWeek, maxCGamesPerWeek1x, maxACGamesPerSeason } = body;

    // Validate start date is a Monday
    const date = new Date(startDate + "T00:00:00");
    if (date.getDay() !== 1) {
      return NextResponse.json(
        { error: "Start date must be a Monday" },
        { status: 400 }
      );
    }

    // Calculate end date (36 weeks from start)
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 36 * 7 - 1);

    const database = await db();
    const result = await database
      .insert(seasons)
      .values({
        startDate,
        endDate: endDate.toISOString().split("T")[0],
        totalWeeks: 36,
        maxCGamesPerWeek: maxCGamesPerWeek ?? 1,
        maxCGamesPerWeek1x: maxCGamesPerWeek1x ?? 4,
        maxACGamesPerSeason: maxACGamesPerSeason ?? 1,
      })
      .returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    console.error("[seasons POST] error:", err);
    return NextResponse.json(
      { error: "Failed to create season" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { id: number; startDate: string; maxCGamesPerWeek?: number | null; maxCGamesPerWeek1x?: number | null; maxACGamesPerSeason?: number | null; daysPerWeek?: number; allowCapOverrideAtSeasonEnd?: boolean; allowedCompositions?: string[] | null };
    const { id, startDate, maxCGamesPerWeek, maxCGamesPerWeek1x, maxACGamesPerSeason, daysPerWeek, allowCapOverrideAtSeasonEnd, allowedCompositions } = body;

    const date = new Date(startDate + "T00:00:00");
    if (date.getDay() !== 1) {
      return NextResponse.json(
        { error: "Start date must be a Monday" },
        { status: 400 }
      );
    }

    const database = await db();

    // Get current totalWeeks to preserve makeup weeks
    const [current] = await database.select().from(seasons).where(eq(seasons.id, id));
    const totalWeeks = current?.totalWeeks ?? 36;

    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + totalWeeks * 7 - 1);

    // v1.208: self-heal the seasons table if new columns aren't yet
    // present. Runs at most once per PUT that references the newer
    // settings; the PRAGMA is cheap.
    if (allowedCompositions !== undefined) {
      try {
        const info = (await database.run(sql`PRAGMA table_info(seasons)`)) as unknown as {
          rows: { name: string }[];
        };
        const cols = new Set((info.rows ?? []).map((r) => r.name));
        if (!cols.has("allowed_compositions")) {
          await database.run(sql`ALTER TABLE \`seasons\` ADD COLUMN \`allowed_compositions\` text`);
        }
      } catch (err) {
        console.warn("[seasons PUT] failed to ensure new season columns:", err);
      }
    }

    const result = await database
      .update(seasons)
      .set({
        startDate,
        endDate: endDate.toISOString().split("T")[0],
        maxCGamesPerWeek: maxCGamesPerWeek !== undefined ? maxCGamesPerWeek : undefined,
        maxCGamesPerWeek1x: maxCGamesPerWeek1x !== undefined ? maxCGamesPerWeek1x : undefined,
        maxACGamesPerSeason: maxACGamesPerSeason !== undefined ? maxACGamesPerSeason : undefined,
        daysPerWeek:
          daysPerWeek !== undefined
            ? (daysPerWeek === 7 ? 7 : daysPerWeek === 6 ? 6 : 5)
            : undefined,
        allowCapOverrideAtSeasonEnd:
          allowCapOverrideAtSeasonEnd !== undefined ? allowCapOverrideAtSeasonEnd : undefined,
        allowedCompositions:
          allowedCompositions === undefined
            ? undefined
            : allowedCompositions === null
              ? null
              : JSON.stringify(allowedCompositions),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(seasons.id, id))
      .returning();

    return NextResponse.json(result[0]);
  } catch (err) {
    console.error("[seasons PUT] error:", err);
    return NextResponse.json(
      { error: "Failed to update season" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const all = request.nextUrl.searchParams.get("all");

    const database = await db();

    if (all === "true") {
      await database.delete(games);
      await database.delete(holidays);
      await database.delete(seasons);
      return NextResponse.json({ success: true });
    }

    if (!id) {
      return NextResponse.json({ error: "id or all=true required" }, { status: 400 });
    }

    const seasonId = parseInt(id);
    await database.delete(games).where(eq(games.seasonId, seasonId));
    await database.delete(holidays).where(eq(holidays.seasonId, seasonId));
    await database.delete(seasons).where(eq(seasons.id, seasonId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[seasons DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to delete season" },
      { status: 500 }
    );
  }
}
