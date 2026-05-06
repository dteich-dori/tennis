import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { playerPayments, players } from "@/db/schema";
import { eq, inArray, asc } from "drizzle-orm";

/**
 * GET /api/player-payments?seasonId=N
 * Returns all payments for players belonging to that season.
 */
export async function GET(request: NextRequest) {
  try {
    const seasonIdRaw = request.nextUrl.searchParams.get("seasonId");
    if (!seasonIdRaw) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }
    const seasonId = parseInt(seasonIdRaw);
    if (Number.isNaN(seasonId)) {
      return NextResponse.json({ error: "seasonId must be a number" }, { status: 400 });
    }
    const database = await db();

    // Find all players for the season — we filter payments by these IDs.
    const seasonPlayers = await database
      .select({ id: players.id })
      .from(players)
      .where(eq(players.seasonId, seasonId));
    const ids = seasonPlayers.map((p) => p.id);
    if (ids.length === 0) return NextResponse.json([]);

    const rows = await database
      .select()
      .from(playerPayments)
      .where(inArray(playerPayments.playerId, ids))
      .orderBy(asc(playerPayments.paidDate));

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[player-payments GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load payments" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/player-payments
 * Body: { playerId: number, paidDate: string (YYYY-MM-DD), amount: number, note?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      playerId?: number;
      paidDate?: string;
      amount?: number;
      note?: string | null;
    };
    if (!body.playerId || typeof body.playerId !== "number") {
      return NextResponse.json({ error: "playerId required" }, { status: 400 });
    }
    if (!body.paidDate || typeof body.paidDate !== "string") {
      return NextResponse.json({ error: "paidDate required (YYYY-MM-DD)" }, { status: 400 });
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: "amount must be a number" }, { status: 400 });
    }

    const database = await db();
    const result = await database
      .insert(playerPayments)
      .values({
        playerId: body.playerId,
        paidDate: body.paidDate,
        amount,
        note: body.note?.trim() || null,
      })
      .returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    console.error("[player-payments POST] error:", err);
    return NextResponse.json(
      { error: "Failed to add payment" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/player-payments?id=N
 * Body: { paidDate?, amount?, note? }
 * Partially updates an existing payment row.
 */
export async function PUT(request: NextRequest) {
  try {
    const idRaw = request.nextUrl.searchParams.get("id");
    if (!idRaw) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const id = parseInt(idRaw);
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    }

    const body = (await request.json()) as {
      paidDate?: string;
      amount?: number;
      note?: string | null;
    };

    const updates: Record<string, unknown> = {};
    if (body.paidDate !== undefined) {
      if (typeof body.paidDate !== "string" || body.paidDate.trim() === "") {
        return NextResponse.json(
          { error: "paidDate must be a non-empty YYYY-MM-DD string" },
          { status: 400 }
        );
      }
      updates.paidDate = body.paidDate.trim();
    }
    if (body.amount !== undefined) {
      const n = Number(body.amount);
      if (!Number.isFinite(n)) {
        return NextResponse.json(
          { error: "amount must be a number" },
          { status: 400 }
        );
      }
      updates.amount = n;
    }
    if (body.note !== undefined) {
      updates.note = body.note ? String(body.note).trim() || null : null;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const database = await db();
    const result = await database
      .update(playerPayments)
      .set(updates)
      .where(eq(playerPayments.id, id))
      .returning();
    if (result.length === 0) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    return NextResponse.json(result[0]);
  } catch (err) {
    console.error("[player-payments PUT] error:", err);
    return NextResponse.json(
      { error: "Failed to update payment" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/player-payments?id=N
 * Removes a single payment.
 */
export async function DELETE(request: NextRequest) {
  try {
    const idRaw = request.nextUrl.searchParams.get("id");
    if (!idRaw) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const id = parseInt(idRaw);
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    }
    const database = await db();
    await database.delete(playerPayments).where(eq(playerPayments.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[player-payments DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to delete payment" },
      { status: 500 }
    );
  }
}
