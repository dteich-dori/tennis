import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { POST as autoAssignPOST } from "../auto-assign/route";

interface Target {
  gameId: number;
  playerId: number | null; // null = nobody to clear (used for "Incomplete" rows — just re-run auto-assign)
}

interface ReAssignBody {
  seasonId: number;
  effectiveDate: string; // YYYY-MM-DD — games before this are rejected
  targets: Target[];
  runAutoAssign?: boolean; // default true
  assignExtra?: boolean;
  assignCSubs?: boolean;
}

/**
 * POST /api/games/re-assign
 * Removes specific {gameId, playerId} slot assignments (only when playerId != null),
 * then runs auto-assign across the affected weeks to re-fill empty slots.
 * Games whose date is before `effectiveDate` are rejected.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ReAssignBody;
    const {
      seasonId,
      effectiveDate,
      targets = [],
      runAutoAssign = true,
      assignExtra = false,
      assignCSubs = false,
    } = body;

    if (!seasonId || !effectiveDate) {
      return NextResponse.json(
        { error: "seasonId and effectiveDate required" },
        { status: 400 }
      );
    }
    if (!Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json(
        { error: "targets array is required and must be non-empty" },
        { status: 400 }
      );
    }

    const database = await db();
    const uniqueGameIds = [...new Set(targets.map((t) => t.gameId))];

    // Load the involved games to validate they belong to the season and are
    // on/after the effective date.
    const involvedGames = await database
      .select()
      .from(games)
      .where(
        and(eq(games.seasonId, seasonId), inArray(games.id, uniqueGameIds))
      );

    if (involvedGames.length === 0) {
      return NextResponse.json(
        { error: "No matching games found for these targets" },
        { status: 400 }
      );
    }

    const gameById = new Map(involvedGames.map((g) => [g.id, g]));
    const rejected: Array<{ gameId: number; reason: string }> = [];
    const acceptedTargets: Target[] = [];
    for (const t of targets) {
      const g = gameById.get(t.gameId);
      if (!g) {
        rejected.push({ gameId: t.gameId, reason: "Game not found" });
        continue;
      }
      if (g.date < effectiveDate) {
        rejected.push({
          gameId: t.gameId,
          reason: `Game date ${g.date} is before effective date ${effectiveDate}`,
        });
        continue;
      }
      acceptedTargets.push(t);
    }

    // Delete only the specific {gameId, playerId} pairs (not all assignments)
    let cleared = 0;
    for (const t of acceptedTargets) {
      if (t.playerId == null) continue; // "Incomplete" row — nothing to remove
      const result = await database
        .delete(gameAssignments)
        .where(
          and(
            eq(gameAssignments.gameId, t.gameId),
            eq(gameAssignments.playerId, t.playerId)
          )
        )
        .returning();
      cleared += result.length;
    }

    // Determine which weeks need re-filling
    const affectedWeeks = new Set<number>();
    for (const t of acceptedTargets) {
      const g = gameById.get(t.gameId);
      if (g) affectedWeeks.add(g.weekNumber);
    }

    const perWeekResults: Array<{
      weekNumber: number;
      assignedCount: number;
      unfilled: number;
      error?: string;
    }> = [];

    if (runAutoAssign) {
      for (const wk of [...affectedWeeks].sort((a, b) => a - b)) {
        try {
          const fakeReq = new NextRequest(
            "http://localhost/api/games/auto-assign",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                seasonId,
                weekNumber: wk,
                assignExtra,
                assignCSubs,
              }),
            }
          );
          const res = await autoAssignPOST(fakeReq);
          const data = (await res.json()) as {
            assignedCount?: number;
            unfilled?: number;
            error?: string;
          };
          perWeekResults.push({
            weekNumber: wk,
            assignedCount: data.assignedCount ?? 0,
            unfilled: data.unfilled ?? 0,
            error: data.error,
          });
        } catch (err) {
          perWeekResults.push({
            weekNumber: wk,
            assignedCount: 0,
            unfilled: 0,
            error: String(err),
          });
        }
      }
    }

    const filled = perWeekResults.reduce((s, r) => s + r.assignedCount, 0);
    const stillEmpty = perWeekResults.reduce((s, r) => s + r.unfilled, 0);

    return NextResponse.json({
      success: true,
      cleared,
      filled,
      stillEmpty,
      rejected,
      weeks: perWeekResults,
    });
  } catch (err) {
    console.error("[games/re-assign] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
