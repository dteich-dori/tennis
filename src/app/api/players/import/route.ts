import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface ImportPlayer {
  firstName: string;
  lastName: string;
  cellNumber: string | null;
  homeNumber: string | null;
  email: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId: number;
      players: ImportPlayer[];
    };
    const { seasonId, players: importPlayers } = body;

    if (!seasonId || !importPlayers?.length) {
      return NextResponse.json(
        { error: "seasonId and players array required" },
        { status: 400 }
      );
    }

    const database = await db();

    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const p of importPlayers) {
      // Check for existing player by first + last name
      const existing = await database
        .select()
        .from(players)
        .where(
          and(
            eq(players.seasonId, seasonId),
            eq(players.firstName, p.firstName),
            eq(players.lastName, p.lastName)
          )
        );

      if (existing.length > 0) {
        // Update only non-empty fields from CSV
        const current = existing[0];
        const updates: Record<string, string | null> = {};

        if (p.cellNumber && p.cellNumber !== current.cellNumber) {
          updates.cellNumber = p.cellNumber;
        }
        if (p.homeNumber && p.homeNumber !== current.homeNumber) {
          updates.homeNumber = p.homeNumber;
        }
        if (p.email && p.email !== current.email) {
          updates.email = p.email;
        }

        if (Object.keys(updates).length > 0) {
          await database
            .update(players)
            .set(updates)
            .where(eq(players.id, current.id));
          updated++;
        } else {
          skipped++;
        }
      } else {
        // New player — insert with defaults
        await database.insert(players).values({
          seasonId,
          firstName: p.firstName,
          lastName: p.lastName,
          cellNumber: p.cellNumber || null,
          homeNumber: p.homeNumber || null,
          email: p.email || null,
          isActive: true,
          contractedFrequency: "1",
          skillLevel: "C",
          noConsecutiveDays: false,
          isDerated: false,
          soloShareLevel: null,
        });
        added++;
      }
    }

    return NextResponse.json({ success: true, added, updated, skipped }, { status: 201 });
  } catch (err) {
    console.error("[players/import POST] error:", err);
    return NextResponse.json(
      { error: "Failed to import players" },
      { status: 500 }
    );
  }
}
