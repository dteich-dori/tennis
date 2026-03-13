import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, seasons } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

interface LogEntry {
  type: "info" | "warning" | "error";
  week?: number;
  message: string;
}

/**
 * POST /api/games/auto-assign-all
 * Body: { seasonId: number }
 * Auto-assigns Don's games for ALL weeks, skipping weeks that already have
 * any Don's assignments (fully or partially assigned).
 */
export async function POST(request: NextRequest) {
  try {
    const { seasonId, infoOnly, assignExtra, assignCSubs } = (await request.json()) as {
      seasonId: number;
      infoOnly?: boolean;
      assignExtra?: boolean;
      assignCSubs?: boolean;
    };
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const log: LogEntry[] = [];

    // Get the season to find totalWeeks
    const [season] = await database.select().from(seasons).where(eq(seasons.id, seasonId));
    if (!season) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }
    const totalWeeks = season.totalWeeks ?? 36;

    // Get all Don's normal games grouped by week, with assignment counts
    const allDonsGames = await database
      .select()
      .from(games)
      .where(
        and(
          eq(games.seasonId, seasonId),
          eq(games.group, "dons"),
          eq(games.status, "normal")
        )
      );

    // Group game IDs by week
    const gameIdsByWeek = new Map<number, number[]>();
    for (const g of allDonsGames) {
      const arr = gameIdsByWeek.get(g.weekNumber) ?? [];
      arr.push(g.id);
      gameIdsByWeek.set(g.weekNumber, arr);
    }

    // Check which weeks are fully assigned (all games have 4 players)
    const fullyAssignedWeeks = new Set<number>();
    const BATCH = 50;
    for (const [week, gIds] of gameIdsByWeek) {
      let totalAssignments = 0;
      for (let i = 0; i < gIds.length; i += BATCH) {
        const batch = gIds.slice(i, i + BATCH);
        const rows = await database
          .select({ id: gameAssignments.id })
          .from(gameAssignments)
          .where(inArray(gameAssignments.gameId, batch));
        totalAssignments += rows.length;
      }
      // Fully assigned = every game has exactly 4 players
      if (totalAssignments >= gIds.length * 4) {
        fullyAssignedWeeks.add(week);
      }
    }

    // Determine which weeks to assign (skip only fully-assigned weeks)
    const weeksToAssign: number[] = [];
    const weeksSkipped: number[] = [];

    for (let w = 1; w <= totalWeeks; w++) {
      if (!gameIdsByWeek.has(w)) continue; // no games this week
      if (fullyAssignedWeeks.has(w)) {
        weeksSkipped.push(w);
      } else {
        weeksToAssign.push(w);
      }
    }

    // Info-only mode: return which weeks need assignment without doing anything
    if (infoOnly) {
      return NextResponse.json({
        success: true,
        weeksToAssign,
        weeksSkipped,
      });
    }

    if (weeksSkipped.length > 0) {
      log.push({
        type: "info",
        message: `Skipping ${weeksSkipped.length} week(s) with existing assignments: ${weeksSkipped.join(", ")}`,
      });
    }

    if (weeksToAssign.length === 0) {
      log.push({
        type: "info",
        message: "All weeks already have Don's assignments. Nothing to do.",
      });
      return NextResponse.json({
        success: true,
        weeksAssigned: 0,
        weeksSkipped: weeksSkipped.length,
        totalAssigned: 0,
        totalSlots: 0,
        totalUnfilled: 0,
        log,
      });
    }

    // Call existing auto-assign endpoint for each week sequentially
    // Build the base URL from the incoming request
    const baseUrl = request.nextUrl.origin;
    let totalAssigned = 0;
    let totalSlots = 0;
    let totalUnfilled = 0;
    let weeksAssignedCount = 0;

    // Forward cookies/auth headers from the original request
    const cookieHeader = request.headers.get("cookie") ?? "";

    for (const week of weeksToAssign) {
      try {
        const res = await fetch(`${baseUrl}/api/games/auto-assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieHeader,
          },
          body: JSON.stringify({ seasonId, weekNumber: week, assignExtra, assignCSubs }),
        });

        const data = await res.json();

        if (!res.ok) {
          log.push({
            type: "error",
            week,
            message: `Week ${week}: ${data.error || "Failed"}`,
          });
          // If solo not assigned, this is a blocking error for all remaining weeks
          if (data.error?.includes("Solo games must be fully assigned")) {
            log.push({
              type: "error",
              message: "Stopping: Solo games must be fully assigned before Don's auto-assign.",
            });
            break;
          }
          continue;
        }

        const filled = data.assignedCount ?? 0;
        const slots = data.totalSlots ?? 0;
        const unfilled = data.unfilled ?? 0;

        totalAssigned += filled;
        totalSlots += slots;
        totalUnfilled += unfilled;
        weeksAssignedCount++;

        log.push({
          type: unfilled > 0 ? "warning" : "info",
          week,
          message: `Week ${week}: ${filled}/${slots} slots filled${unfilled > 0 ? ` (${unfilled} unfilled)` : ""}`,
        });

        // Forward any warnings from the per-week log
        if (data.log) {
          for (const entry of data.log) {
            if (entry.type === "warning" || entry.type === "error") {
              log.push({ type: entry.type, week, message: `  ${entry.message}` });
            }
          }
        }
      } catch (err) {
        log.push({
          type: "error",
          week,
          message: `Week ${week}: ${String(err)}`,
        });
      }
    }

    log.push({
      type: "info",
      message: `Done: ${weeksAssignedCount} week(s) assigned, ${totalAssigned}/${totalSlots} total slots filled.`,
    });

    return NextResponse.json({
      success: true,
      weeksAssigned: weeksAssignedCount,
      weeksSkipped: weeksSkipped.length,
      totalAssigned,
      totalSlots,
      totalUnfilled,
      log,
    });
  } catch (err) {
    console.error("[auto-assign-all POST] error:", err);
    return NextResponse.json(
      { error: "Auto-assign all failed: " + String(err) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/games/auto-assign-all
 * Body: { seasonId: number }
 * Clears ALL Don's game assignments for ALL weeks in the season.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { seasonId } = (await request.json()) as { seasonId: number };
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();

    // Find all Don's normal games for the season
    const allDonsGames = await database
      .select({ id: games.id })
      .from(games)
      .where(
        and(
          eq(games.seasonId, seasonId),
          eq(games.group, "dons"),
          eq(games.status, "normal")
        )
      );

    const gameIds = allDonsGames.map((g) => g.id);
    if (gameIds.length === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    // Delete all assignments for these games
    let deletedCount = 0;
    const BATCH = 50;
    for (let i = 0; i < gameIds.length; i += BATCH) {
      const batch = gameIds.slice(i, i + BATCH);
      const result = await database
        .delete(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch))
        .returning();
      deletedCount += result.length;
    }

    return NextResponse.json({ success: true, deletedCount });
  } catch (err) {
    console.error("[auto-assign-all DELETE] error:", err);
    return NextResponse.json(
      { error: "Clear all failed: " + String(err) },
      { status: 500 }
    );
  }
}
