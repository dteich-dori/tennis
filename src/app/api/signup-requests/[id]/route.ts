import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import {
  signupRequests,
  players,
  playerBlockedDays,
  seasons,
  playerVacations,
  playerDoNotPair,
} from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/signup-requests/:id
 *
 * Body forms:
 *   { action: "reject" }
 *     — Marks the request as rejected. Doesn't touch the players table.
 *
 *   { action: "approve",
 *     seasonId: number,
 *     skillLevel?: string,          // default "C"
 *     contractedFrequency?: string, // default "0" (sub)
 *     isActive?: boolean            // default true
 *   }
 *     — Creates a real players row from the request, marks the request
 *       approved, and preserves the audit trail (reviewedAt).
 *
 * Blank cell/email fields on the signup are stored as NULL on the
 * player. Vacations/blocked-days/DNP are NOT created — those get
 * set later by the admin in the Players page.
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }
    const body = (await request.json()) as {
      action: "approve" | "reject";
      seasonId?: number;
      skillLevel?: string;
      contractedFrequency?: string;
      isActive?: boolean;
    };

    const database = await db();
    const [req] = await database
      .select()
      .from(signupRequests)
      .where(eq(signupRequests.id, id));
    if (!req) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }
    if (req.status !== "pending") {
      return NextResponse.json(
        { error: `This request has already been ${req.status}.` },
        { status: 400 }
      );
    }

    const reviewedAt = new Date().toISOString();

    if (body.action === "reject") {
      await database
        .update(signupRequests)
        .set({ status: "rejected", reviewedAt })
        .where(eq(signupRequests.id, id));
      return NextResponse.json({ ok: true, action: "reject" });
    }

    if (body.action === "approve") {
      const seasonId = Number(body.seasonId);
      if (!Number.isFinite(seasonId) || seasonId <= 0) {
        return NextResponse.json(
          { error: "seasonId is required to approve a signup request." },
          { status: 400 }
        );
      }
      // Validate season exists
      const [season] = await database
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.id, seasonId));
      if (!season) {
        return NextResponse.json({ error: "Season not found." }, { status: 404 });
      }

      const skillLevel = body.skillLevel ?? "C";
      const contractedFrequency = body.contractedFrequency ?? "0";
      const isActive = body.isActive ?? true;

      const [newPlayer] = await database
        .insert(players)
        .values({
          seasonId,
          firstName: req.firstName,
          lastName: req.lastName,
          cellNumber: req.cellNumber ?? null,
          carrier: req.carrier ?? null,
          email: req.email ?? null,
          skillLevel,
          contractedFrequency,
          isActive,
        })
        .returning();

      await database
        .update(signupRequests)
        .set({ status: "approved", reviewedAt })
        .where(eq(signupRequests.id, id));

      // Touch related helper tables so PlayerData readers don't 404 —
      // create empty placeholder rows only if the schema requires. For
      // this project the reads are LEFT-side and tolerate no rows, so
      // no placeholders needed.
      void playerBlockedDays;
      void playerVacations;
      void playerDoNotPair;

      return NextResponse.json({
        ok: true,
        action: "approve",
        playerId: newPlayer.id,
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Expected 'approve' or 'reject'." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[signup-requests PATCH] error:", err);
    return NextResponse.json(
      { error: "Failed to update signup request." },
      { status: 500 }
    );
  }
}
