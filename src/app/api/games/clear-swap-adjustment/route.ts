import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerAvailableDates, playerVacations, playerBlockedDays } from "@/db/schema";
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
    const allBlockedDays = await database.select().from(playerBlockedDays);

    // Build player lookup maps
    const playerMap = new Map(allPlayers.map((p) => [p.id, p]));
    const blockedDaysByPlayer = new Map<number, number[]>();
    for (const bd of allBlockedDays) {
      const arr = blockedDaysByPlayer.get(bd.playerId) ?? [];
      arr.push(bd.dayOfWeek);
      blockedDaysByPlayer.set(bd.playerId, arr);
    }
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

    // For each assignment: check if the player is on a no-makeup vacation date.
    // Iterate over a snapshot — allAssignments is mutated during processing.
    let swapsCompleted = 0;
    let generalFills = 0;
    let vacationDaysLeft = 0;
    const assignmentSnapshot = [...allAssignments];
    for (const assignment of assignmentSnapshot) {
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
      // A scheduled sub may already be assigned on this date (auto-assign placed
      // them as a regular sub). That's fine — we move them to the vacation slot.
      const eligibleSubs = allPlayers.filter((p) => {
        if (p.contractedFrequency !== "0" && p.contractedFrequency !== "1+") return false;
        if (p.skillLevel !== assignedPlayer.skillLevel) return false;
        const availDates = availableDatesByPlayer.get(p.id) ?? [];
        if (availDates.length === 0) return false;
        const coveringDate = availDates.some(
          (ad) => game.date >= ad.startDate && game.date <= ad.endDate
        );
        if (!coveringDate) return false;
        return true;
      });

      if (eligibleSubs.length === 0) {
        // No scheduled sub — try alwaysAvailable subs of the same skill level
        // as a general-pool fallback (no swap attribution).
        const generalSub = allPlayers.find((p) => {
          if (p.contractedFrequency !== "0" && p.contractedFrequency !== "1+") return false;
          if (!p.alwaysAvailable) return false;
          if (p.skillLevel !== assignedPlayer.skillLevel) return false;
          // Blocked day check
          if ((blockedDaysByPlayer.get(p.id) ?? []).includes(game.dayOfWeek)) return false;
          // Vacation check — subs can have vacations even with alwaysAvailable
          const subVacations = vacationsByPlayer.get(p.id) ?? [];
          if (subVacations.some((v) => game.date >= v.startDate && game.date <= v.endDate)) return false;
          // Not already assigned on this date
          const alreadyOnDate = allAssignments.some(
            (a) =>
              a.playerId === p.id &&
              allDonsGames.find((g) => g.id === a.gameId)?.date === game.date
          );
          return !alreadyOnDate;
        });

        if (generalSub) {
          // Replace with general-pool sub (no coveringForPlayerId — not a swap)
          try {
            await database
              .delete(gameAssignments)
              .where(eq(gameAssignments.id, assignment.id));

            await database
              .insert(gameAssignments)
              .values({
                gameId: assignment.gameId,
                playerId: generalSub.id,
                slotPosition: assignment.slotPosition,
                isPrefill: assignment.isPrefill,
                coveringForPlayerId: null,
              });

            generalFills++;
            log.push({
              type: "info",
              message: `Game #${game.gameNumber} slot ${assignment.slotPosition}: replaced ${assignedPlayer.lastName} (vacation) with ${generalSub.lastName} (general sub)`,
            });
          } catch (err) {
            log.push({
              type: "warning",
              message: `Failed to replace ${assignedPlayer.lastName} in game #${game.gameNumber}: ${err}`,
            });
          }
          continue;
        }

        // No sub at all: remove the assignment, slot stays unfilled
        try {
          await database
            .delete(gameAssignments)
            .where(eq(gameAssignments.id, assignment.id));

          vacationDaysLeft++;
          log.push({
            type: "info",
            message: `Game #${game.gameNumber} slot ${assignment.slotPosition}: removed ${assignedPlayer.lastName} (vacation, no makeup) — no sub available, slot now unfilled`,
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

      // Check if this sub is already assigned on this date (auto-assign may
      // have placed them as a regular sub). If so, remove that assignment
      // first so we can move them to the vacation player's slot.
      const existingSubAssignment = allAssignments.find(
        (a) =>
          a.playerId === chosenSub.id &&
          allDonsGames.find((g) => g.id === a.gameId)?.date === game.date
      );

      try {
        if (existingSubAssignment) {
          const existingGame = allDonsGames.find((g) => g.id === existingSubAssignment.gameId);
          await database
            .delete(gameAssignments)
            .where(eq(gameAssignments.id, existingSubAssignment.id));
          // Remove from in-memory array so later iterations see updated state
          const idx = allAssignments.indexOf(existingSubAssignment);
          if (idx !== -1) allAssignments.splice(idx, 1);
          log.push({
            type: "info",
            message: `Game #${existingGame?.gameNumber ?? "?"} slot ${existingSubAssignment.slotPosition}: removed ${chosenSub.lastName} (moving to clear-swap duty)`,
          });
        }

        // Remove vacation player's assignment
        await database
          .delete(gameAssignments)
          .where(eq(gameAssignments.id, assignment.id));

        // Insert sub into vacation player's slot with attribution
        await database
          .insert(gameAssignments)
          .values({
            gameId: assignment.gameId,
            playerId: chosenSub.id,
            slotPosition: assignment.slotPosition,
            isPrefill: assignment.isPrefill,
            coveringForPlayerId: assignedPlayer.id,
          });

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
      message: `Clear-swap adjustment complete: ${swapsCompleted} swap(s), ${generalFills} general sub fill(s), ${vacationDaysLeft} slot(s) unfilled.`,
    });

    return NextResponse.json({
      success: true,
      swapsCompleted,
      generalFills,
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
