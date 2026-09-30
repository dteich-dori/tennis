import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { courtSchedules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { blockIfProtected } from "@/lib/scheduleProtection";

/**
 * POST /api/courts/replace
 * Body: { seasonId, slots: [{ dayOfWeek, courtNumber, startTime, isSolo }] }
 *
 * Replaces a season's whole court schedule in ONE atomic batch.
 *
 * The Import button used to do this from the browser as N delete calls
 * followed by N inserts. Three things were wrong with that: a failure
 * partway through left the season with half a court schedule and no way
 * to tell; an empty or malformed file wiped the schedule before anything
 * was validated; and once DELETE became protected the deletes would be
 * refused while the inserts still ran.
 *
 * So: validate everything first, refuse an empty set, then delete and
 * insert as a single batch that either all lands or none does.
 */

interface IncomingSlot {
  dayOfWeek: number;
  courtNumber: number;
  startTime: string;
  isSolo?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { seasonId: number; slots: IncomingSlot[] };
    const { seasonId, slots } = body;

    if (!seasonId) {
      return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    }

    const blocked = await blockIfProtected(seasonId, "Replace the court schedule (Import)");
    if (blocked) return blocked;

    if (!Array.isArray(slots) || slots.length === 0) {
      //  An import that replaces everything with nothing is always a
      //  mistake — a wrong file, or a parse that produced no rows.
      return NextResponse.json(
        { error: "Refusing to replace the court schedule with an empty list." },
        { status: 400 }
      );
    }

    // Validate every row BEFORE touching anything.
    const seen = new Set<string>();
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const where = `row ${i + 1}`;
      if (typeof s.dayOfWeek !== "number" || s.dayOfWeek < 0 || s.dayOfWeek > 6) {
        return NextResponse.json({ error: `${where}: dayOfWeek must be 0-6` }, { status: 400 });
      }
      if (typeof s.courtNumber !== "number" || s.courtNumber < 1 || s.courtNumber > 6) {
        return NextResponse.json({ error: `${where}: courtNumber must be 1-6` }, { status: 400 });
      }
      if (!s.startTime || !/^\d{2}:\d{2}$/.test(s.startTime)) {
        return NextResponse.json({ error: `${where}: startTime must be HH:MM` }, { status: 400 });
      }
      const key = `${s.dayOfWeek}|${s.courtNumber}|${s.startTime}`;
      if (seen.has(key)) {
        return NextResponse.json(
          { error: `${where}: duplicate day/court/time in the imported file` },
          { status: 400 }
        );
      }
      seen.add(key);
    }

    const database = await db();
    const existing = await database
      .select()
      .from(courtSchedules)
      .where(eq(courtSchedules.seasonId, seasonId));

    await database.batch([
      database.delete(courtSchedules).where(eq(courtSchedules.seasonId, seasonId)),
      ...slots.map((s) =>
        database.insert(courtSchedules).values({
          seasonId,
          dayOfWeek: s.dayOfWeek,
          courtNumber: s.courtNumber,
          startTime: s.startTime,
          isSolo: !!s.isSolo,
        })
      ),
    ] as unknown as Parameters<typeof database.batch>[0]);

    return NextResponse.json({ success: true, removed: existing.length, added: slots.length });
  } catch (err) {
    console.error("[courts/replace] error:", err);
    return NextResponse.json({ error: "Failed to replace the court schedule" }, { status: 500 });
  }
}
