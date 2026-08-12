import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerAvailableDates, playerVacations } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

interface LogEntry {
  type: "info" | "warning";
  message: string;
}

/**
 * POST /api/games/clear-swap-adjustment
 * Body: { seasonId: number }
 *
 * Post-processing pass: after auto-assign-all completes, find contracted players
 * assigned to slots on their "no vacation makeup" vacation dates, and swap them
 * for scheduled subs (those with non-empty availableDates) covering the same date.
 *
 * This handles cases where composition feasibility during the main algorithm
 * rejected the sub, but the assignment is now feasible since the contracted
 * player is already "counted" in the final composition.
 */
export async function POST(request: NextRequest) {
  try {
    const { seasonId } = (await request.json()) as { seasonId: number };
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const log: LogEntry[] = [];

    // Load all relevant data
    const allPlayers = await database
      .select()
      .from(players)
      .where(eq(players.seasonId, seasonId));

    const allVacations = await database.select().from(playerVacations);
    const allAvailableDates = await database.select().from(playerAvailableDates);

    // Build player lookup maps
    const playerMap = new Map(allPlayers.map((p) => [p.id, p]));
    const vacationsByPlayer = new Map<number, typeof allVacations>();
    for (const v of allVacations) {
      const arr = vacationsByPlayer.get(v.playerId) ?? [];
      arr.push(v);
      vacationsByPlayer.set(v.playerId, arr);
    }
    const availableDatesByPlayer = new Map<number, typeof allAvailableDates>();
    for (const ad of allAvailableDates) {
      const arr = availableDatesByPlayer.get(ad.playerId) ?? [];
      arr.push(ad);
      availableDatesByPlayer.set(ad.playerId, arr);
    }

    // Get all Don's games for the season
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

    // Get all assignments for these games
    const gameIds = allDonsGames.map((g) => g.id);
    let allAssignments: typeof gameAssignments.$inferSelect[] = [];
    const BATCH = 50;
    for (let i = 0; i < gameIds.length; i += BATCH) {
      const batch = gameIds.slice(i, i + BATCH);
      const batchResults = await database
        .select()
        .from(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch));
      allAssignments.push(...batchResults);
    }

    // For each assignment: check if the player is on a no-makeup vacation date
    let swapsCompleted = 0;
    let vacationDaysLeft = 0;
    for (const assignment of allAssignments) {
      const game = allDonsGames.find((g) => g.id === assignment.gameId);
      if (!game) continue;

      const assignedPlayer = playerMap.get(assignment.playerId);
      if (!assignedPlayer) continue;

      // Only consider contracted players (exclude subs with freq=0)
      if (assignedPlayer.contractedFrequency === "0") continue;

      // Check if this player is on vacation with noVacationMakeup on this game's date
      const playerVacations = vacationsByPlayer.get(assignedPlayer.id) ?? [];
      const isOnNoMakeupVacation = assignedPlayer.noVacationMakeup
        && playerVacations.some((v) => game.date >= v.startDate && game.date <= v.endDate);

      if (!isOnNoMakeupVacation) continue;

      // Found a candidate slot. Now find eligible scheduled subs for this date.
      const eligibleSubs = allPlayers.filter((p) => {
        // Must be a sub (freq=0 or 1+), not a regular contracted player
        if (p.contractedFrequency !== "0" && p.contractedFrequency !== "1+") return false;

        // Must match skill level of the vacationing player
        if (p.skillLevel !== assignedPlayer.skillLevel) return false;

        // Must have non-empty availableDates (scheduled sub)
        const availDates = availableDatesByPlayer.get(p.id) ?? [];
        if (availDates.length === 0) return false;

        // Check if they cover this game's date
        const coveringDate = availDates.some(
          (ad) => game.date >= ad.startDate && game.date <= ad.endDate
        );
        if (!coveringDate) return false;

        // Check if already assigned on this date
        const alreadyOnDate = allAssignments.some(
          (a) =>
            a.playerId === p.id &&
            allDonsGames.find((g) => g.id === a.gameId)?.date === game.date
        );
        if (alreadyOnDate) return false;

        return true;
      });

      if (eligibleSubs.length === 0) {
        // No scheduled sub available: must remove the assignment (cannot leave
        // a player on vacation in the final schedule). Delete the assignment
        // and mark the slot as unfilled — other eligible players can fill it
        // or it stays empty.
        try {
          await database
            .delete(gameAssignments)
            .where(eq(gameAssignments.id, assignment.id));

          vacationDaysLeft++;
          log.push({
            type: "info",
            message: `Game #${game.gameNumber} slot ${assignment.slotPosition}: removed ${assignedPlayer.lastName} (vacation, no makeup) — no scheduled sub available, slot now unfilled`,
          });
        } catch (err) {
          log.push({
            type: "warning",
            message: `Failed to remove ${assignedPlayer.lastName} from game #${game.gameNumber}: ${err}`,
          });
        }
        continue;
      }

      // Pick the first eligible sub (could add scoring here if needed)
      const chosenSub = eligibleSubs[0];

      // Perform the swap: delete old assignment, insert new one
      try {
        await database
          .delete(gameAssignments)
          .where(eq(gameAssignments.id, assignment.id));

        const result = await database
          .insert(gameAssignments)
          .values({
            gameId: assignment.gameId,
            playerId: chosenSub.id,
            slotPosition: assignment.slotPosition,
            isPrefill: assignment.isPrefill,
            coveringForPlayerId: assignedPlayer.id,
          })
          .returning();

        swapsCompleted++;
        log.push({
          type: "info",
          message: `Game #${game.gameNumber} slot ${assignment.slotPosition}: swapped ${assignedPlayer.lastName} (vacation) → ${chosenSub.lastName} (clear-swap sub)`,
        });
      } catch (err) {
        log.push({
          type: "warning",
          message: `Failed to swap slot in game #${game.gameNumber}: ${err}`,
        });
      }
    }

    log.push({
      type: "info",
      message: `Clear-swap adjustment complete: ${swapsCompleted} slot(s) swapped, ${vacationDaysLeft} vacation slot(s) kept (no sub available).`,
    });

    return NextResponse.json({
      success: true,
      swapsCompleted,
      vacationDaysKept: vacationDaysLeft,
      log,
    });
  } catch (err) {
    console.error("[clear-swap-adjustment POST] error:", err);
    return NextResponse.json(
      { error: "Clear-swap adjustment failed: " + String(err) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/games/clear-swap-adjustment
 * Body: { seasonId: number }
 *
 * Clears all clear-swap assignments (sets coveringForPlayerId = null for all
 * assignments, but leaves the assignment intact). Useful for re-running the
 * adjustment pass.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { seasonId } = (await request.json()) as { seasonId: number };
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();

    // Find all assignments with non-null coveringForPlayerId for this season's games
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
      return NextResponse.json({ success: true, clearedCount: 0 });
    }

    // Clear coveringForPlayerId for all matching assignments
    let clearedCount = 0;
    const BATCH = 50;
    for (let i = 0; i < gameIds.length; i += BATCH) {
      const batch = gameIds.slice(i, i + BATCH);
      const toUpdate = await database
        .select()
        .from(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch));

      for (const a of toUpdate) {
        if (a.coveringForPlayerId != null) {
          await database
            .update(gameAssignments)
            .set({ coveringForPlayerId: null })
            .where(eq(gameAssignments.id, a.id));
          clearedCount++;
        }
      }
    }

    return NextResponse.json({ success: true, clearedCount });
  } catch (err) {
    console.error("[clear-swap-adjustment DELETE] error:", err);
    return NextResponse.json(
      { error: "Clear failed: " + String(err) },
      { status: 500 }
    );
  }
}
