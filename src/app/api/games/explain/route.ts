import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, players, playerBlockedDays, playerVacations, playerDoNotPair, seasons } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * GET /api/games/explain?gameId=123
 * Returns an explanation of the assignment logic for a specific game.
 */
export async function GET(request: NextRequest) {
  try {
    const gameId = Number(request.nextUrl.searchParams.get("gameId"));
    if (!gameId) {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }

    const database = await db();

    // 1. Load the game
    const [game] = await database.select().from(games).where(eq(games.id, gameId));
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // 2. Load assignments for this game
    const assignments = await database
      .select()
      .from(gameAssignments)
      .where(eq(gameAssignments.gameId, gameId))
      .orderBy(gameAssignments.slotPosition);

    if (assignments.length === 0) {
      return NextResponse.json({
        game: {
          gameNumber: game.gameNumber,
          date: game.date,
          dayOfWeek: DAYS[game.dayOfWeek],
          startTime: game.startTime,
          courtNumber: game.courtNumber,
          group: game.group,
          status: game.status,
          weekNumber: game.weekNumber,
        },
        composition: "Empty — no players assigned",
        players: [],
        notes: [],
      });
    }

    // 3. Load season
    const [season] = await database.select().from(seasons).where(eq(seasons.id, game.seasonId));

    // 4. Load assigned players with full data
    const playerIds = assignments.map((a) => a.playerId);
    const playerRows = await database.select().from(players).where(inArray(players.id, playerIds));

    // Load constraints
    const blockedDaysRows = await database.select().from(playerBlockedDays).where(inArray(playerBlockedDays.playerId, playerIds));
    const vacationRows = await database.select().from(playerVacations).where(inArray(playerVacations.playerId, playerIds));
    const dnpRows = await database.select().from(playerDoNotPair).where(inArray(playerDoNotPair.playerId, playerIds));

    const blockedByPlayer = new Map<number, number[]>();
    for (const bd of blockedDaysRows) {
      const arr = blockedByPlayer.get(bd.playerId) ?? [];
      arr.push(bd.dayOfWeek);
      blockedByPlayer.set(bd.playerId, arr);
    }
    const vacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
    for (const v of vacationRows) {
      const arr = vacsByPlayer.get(v.playerId) ?? [];
      arr.push(v);
      vacsByPlayer.set(v.playerId, arr);
    }
    const dnpByPlayer = new Map<number, number[]>();
    for (const d of dnpRows) {
      const arr = dnpByPlayer.get(d.playerId) ?? [];
      arr.push(d.pairedPlayerId);
      dnpByPlayer.set(d.playerId, arr);
    }

    // 5. Compute YTD and WTD counts up to this game's week
    const ytdRows = await database
      .select({
        playerId: gameAssignments.playerId,
        group: games.group,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, game.seasonId),
          eq(games.status, "normal"),
          sql`${games.weekNumber} <= ${game.weekNumber}`
        )
      )
      .groupBy(gameAssignments.playerId, games.group);

    const ytdCounts = new Map<number, { ytdDons: number; ytdSolo: number }>();
    for (const row of ytdRows) {
      const entry = ytdCounts.get(row.playerId) ?? { ytdDons: 0, ytdSolo: 0 };
      if (row.group === "dons") entry.ytdDons += row.count;
      if (row.group === "solo") entry.ytdSolo += row.count;
      ytdCounts.set(row.playerId, entry);
    }

    // WTD for this week
    const wtdRows = await database
      .select({
        playerId: gameAssignments.playerId,
        group: games.group,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(gameAssignments)
      .innerJoin(games, eq(gameAssignments.gameId, games.id))
      .where(
        and(
          eq(games.seasonId, game.seasonId),
          eq(games.status, "normal"),
          eq(games.weekNumber, game.weekNumber)
        )
      )
      .groupBy(gameAssignments.playerId, games.group);

    const wtdCounts = new Map<number, { wtdDons: number; wtdSolo: number }>();
    for (const row of wtdRows) {
      const entry = wtdCounts.get(row.playerId) ?? { wtdDons: 0, wtdSolo: 0 };
      if (row.group === "dons") entry.wtdDons += row.count;
      if (row.group === "solo") entry.wtdSolo += row.count;
      wtdCounts.set(row.playerId, entry);
    }

    // 6. Check how many other games each player has on the same date
    const sameDateGames = await database
      .select()
      .from(games)
      .where(and(eq(games.seasonId, game.seasonId), eq(games.date, game.date), eq(games.status, "normal")));
    const sameDateGameIds = sameDateGames.map((g) => g.id);
    let sameDateAssignments: { gameId: number; playerId: number }[] = [];
    const BATCH = 50;
    for (let i = 0; i < sameDateGameIds.length; i += BATCH) {
      const batch = sameDateGameIds.slice(i, i + BATCH);
      const rows = await database
        .select({ gameId: gameAssignments.gameId, playerId: gameAssignments.playerId })
        .from(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch));
      sameDateAssignments.push(...rows);
    }

    // 7. Check adjacent days for no-consecutive-days players
    const gameDate = new Date(game.date + "T12:00:00");
    const prevDay = new Date(gameDate);
    prevDay.setDate(prevDay.getDate() - 1);
    const nextDay = new Date(gameDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const prevStr = prevDay.toISOString().split("T")[0];
    const nextStr = nextDay.toISOString().split("T")[0];

    const adjacentGames = await database
      .select()
      .from(games)
      .where(
        and(
          eq(games.seasonId, game.seasonId),
          eq(games.status, "normal"),
          sql`${games.date} IN (${prevStr}, ${nextStr})`
        )
      );
    const adjacentGameIds = adjacentGames.map((g) => g.id);
    let adjacentAssignments: { gameId: number; playerId: number; date: string }[] = [];
    for (let i = 0; i < adjacentGameIds.length; i += BATCH) {
      const batch = adjacentGameIds.slice(i, i + BATCH);
      const rows = await database
        .select({ gameId: gameAssignments.gameId, playerId: gameAssignments.playerId })
        .from(gameAssignments)
        .where(inArray(gameAssignments.gameId, batch));
      adjacentAssignments.push(
        ...rows.map((r) => ({
          ...r,
          date: adjacentGames.find((g) => g.id === r.gameId)?.date ?? "",
        }))
      );
    }

    // 8. Count total active players available for this game slot
    const allActivePlayers = await database
      .select()
      .from(players)
      .where(and(eq(players.seasonId, game.seasonId), eq(players.isActive, true)));

    // Load all blocked days for all active players
    const allPlayerIds = allActivePlayers.map((p) => p.id);
    let allBlockedDays: { playerId: number; dayOfWeek: number }[] = [];
    for (let i = 0; i < allPlayerIds.length; i += BATCH) {
      const batch = allPlayerIds.slice(i, i + BATCH);
      const rows = await database.select().from(playerBlockedDays).where(inArray(playerBlockedDays.playerId, batch));
      allBlockedDays.push(...rows);
    }
    let allVacations: { playerId: number; startDate: string; endDate: string }[] = [];
    for (let i = 0; i < allPlayerIds.length; i += BATCH) {
      const batch = allPlayerIds.slice(i, i + BATCH);
      const rows = await database.select().from(playerVacations).where(inArray(playerVacations.playerId, batch));
      allVacations.push(...rows);
    }

    const allBlockedByPlayer = new Map<number, number[]>();
    for (const bd of allBlockedDays) {
      const arr = allBlockedByPlayer.get(bd.playerId) ?? [];
      arr.push(bd.dayOfWeek);
      allBlockedByPlayer.set(bd.playerId, arr);
    }
    const allVacsByPlayer = new Map<number, { startDate: string; endDate: string }[]>();
    for (const v of allVacations) {
      const arr = allVacsByPlayer.get(v.playerId) ?? [];
      arr.push(v);
      allVacsByPlayer.set(v.playerId, arr);
    }

    // Players who could play on this date (basic availability: not blocked day, not on vacation)
    const playersAvailableOnDate = allActivePlayers.filter((p) => {
      if (p.contractedFrequency === "0") return false; // exclude subs
      const blocked = allBlockedByPlayer.get(p.id) ?? [];
      if (blocked.includes(game.dayOfWeek)) return false;
      const vacs = allVacsByPlayer.get(p.id) ?? [];
      if (vacs.some((v) => game.date >= v.startDate && game.date <= v.endDate)) return false;
      return true;
    });

    // Players already assigned to other games on this date
    const playersOnDate = new Set(
      sameDateAssignments
        .filter((a) => a.gameId !== game.id)
        .map((a) => a.playerId)
    );

    // Available for this specific slot (not already playing another game that day)
    const availableForSlot = playersAvailableOnDate.filter((p) => !playersOnDate.has(p.id));

    // 9. Build per-player explanation
    const playerExplanations = assignments.map((assignment) => {
      const player = playerRows.find((p) => p.id === assignment.playerId);
      if (!player) return { slot: assignment.slotPosition, name: "Unknown", notes: [] };

      const notes: string[] = [];
      const ytd = ytdCounts.get(player.id) ?? { ytdDons: 0, ytdSolo: 0 };
      const wtd = wtdCounts.get(player.id) ?? { wtdDons: 0, wtdSolo: 0 };
      const freq = player.contractedFrequency === "2+"
        ? 2
        : parseInt(player.contractedFrequency) || 0;
      const isSolo = game.group === "solo";
      const groupYtd = isSolo ? ytd.ytdSolo : ytd.ytdDons;
      const groupWtd = isSolo ? wtd.wtdSolo : wtd.wtdDons;
      const expectedYtd = freq * Math.min(game.weekNumber, 36);
      const ytdDeficit = expectedYtd - groupYtd;
      const weeklyOwed = freq - groupWtd;

      // Skill level
      notes.push(`Skill level: ${player.skillLevel || "not set"}`);

      // Contracted frequency
      notes.push(`Contract: ${player.contractedFrequency}x/week`);

      // WTD status
      if (weeklyOwed > 0) {
        notes.push(`Week-to-date: owed ${weeklyOwed} more game(s) this week (${groupWtd} of ${freq} played)`);
      } else if (weeklyOwed === 0) {
        notes.push(`Week-to-date: weekly quota met (${groupWtd} of ${freq})`);
      } else {
        notes.push(`Week-to-date: over quota by ${-weeklyOwed} (${groupWtd} of ${freq} — bonus game)`);
      }

      // YTD status
      if (ytdDeficit > 0) {
        notes.push(`Year-to-date: behind by ${ytdDeficit} games (${groupYtd} played, ${expectedYtd} expected by week ${game.weekNumber})`);
      } else if (ytdDeficit === 0) {
        notes.push(`Year-to-date: on track (${groupYtd} played, ${expectedYtd} expected)`);
      } else {
        notes.push(`Year-to-date: ahead by ${-ytdDeficit} games (${groupYtd} played, ${expectedYtd} expected)`);
      }

      // Derated status
      if (player.isDerated) {
        notes.push("⚡ Derated player");
      }

      // Blocked days
      const blocked = blockedByPlayer.get(player.id) ?? [];
      if (blocked.length > 0) {
        const blockedNames = blocked.map((d) => DAYS[d]).join(", ");
        notes.push(`Blocked days: ${blockedNames}`);
      }

      // Vacations
      const vacs = vacsByPlayer.get(player.id) ?? [];
      if (vacs.length > 0) {
        notes.push(`Vacations: ${vacs.map((v) => `${v.startDate} to ${v.endDate}`).join("; ")}`);
      }

      // No consecutive days
      if (player.noConsecutiveDays) {
        const playedPrev = adjacentAssignments.some((a) => a.playerId === player.id && a.date === prevStr);
        const playedNext = adjacentAssignments.some((a) => a.playerId === player.id && a.date === nextStr);
        if (playedPrev || playedNext) {
          notes.push(`⚠️ No-consecutive-days flag is ON — also plays ${playedPrev ? "day before" : ""}${playedPrev && playedNext ? " and " : ""}${playedNext ? "day after" : ""}`);
        } else {
          notes.push("No-consecutive-days: flag ON, no adjacent games");
        }
      }

      // Do-not-pair check
      const dnp = dnpByPlayer.get(player.id) ?? [];
      if (dnp.length > 0) {
        const dnpInGame = dnp.filter((pid) => assignments.some((a) => a.playerId === pid));
        if (dnpInGame.length > 0) {
          const dnpNames = dnpInGame.map((pid) => {
            const p = playerRows.find((pl) => pl.id === pid);
            return p ? `${p.lastName}` : `#${pid}`;
          });
          notes.push(`⚠️ Do-not-pair conflict: paired with ${dnpNames.join(", ")} in this game`);
        }
      }

      // Other games same date
      const otherGamesOnDate = sameDateAssignments.filter(
        (a) => a.playerId === player.id && a.gameId !== game.id
      );
      if (otherGamesOnDate.length > 0) {
        const otherGameDetails = otherGamesOnDate.map((a) => {
          const g = sameDateGames.find((sg) => sg.id === a.gameId);
          return g ? `#${g.gameNumber} (${g.startTime}, Ct ${g.courtNumber})` : `game ${a.gameId}`;
        });
        notes.push(`⚠️ Also plays on same date: ${otherGameDetails.join(", ")}`);
      }

      // Ball bringing (slot 1)
      if (assignment.slotPosition === 1) {
        notes.push("🎾 Brings balls (slot 1)");
      }

      return {
        slot: assignment.slotPosition,
        name: `${player.lastName}, ${player.firstName}`,
        skillLevel: player.skillLevel,
        isDerated: player.isDerated,
        contractedFrequency: player.contractedFrequency,
        weeklyOwed: weeklyOwed,
        ytdDeficit: ytdDeficit,
        notes,
      };
    });

    // 10. Game-level analysis
    const gameNotes: string[] = [];
    const skillLevels = playerExplanations.map((p) => p.skillLevel).filter(Boolean);
    const uniqueSkills = [...new Set(skillLevels)];

    // Composition description
    const skillCounts: Record<string, number> = {};
    for (const sl of skillLevels) {
      if (sl) skillCounts[sl] = (skillCounts[sl] ?? 0) + 1;
    }
    const compositionParts = Object.entries(skillCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([level, count]) => `${count}${level}`);
    const composition = compositionParts.join(" + ") || "Unknown";

    if (uniqueSkills.length === 1) {
      gameNotes.push(`All-${uniqueSkills[0]} game`);
    } else if (uniqueSkills.length === 2) {
      gameNotes.push(`Mixed game: ${composition}`);
      if (uniqueSkills.includes("A") && uniqueSkills.includes("C")) {
        gameNotes.push("⚠️ A and C players paired — unusual mix");
      }
    } else if (uniqueSkills.length > 2) {
      gameNotes.push(`Wide skill mix: ${composition}`);
    }

    // Pool size info
    gameNotes.push(`${playersAvailableOnDate.length} contracted players available on ${DAYS[game.dayOfWeek]} ${game.date}`);
    gameNotes.push(`${availableForSlot.length} not already assigned to another game this day`);

    // Skill breakdown of available pool
    const poolBySkill: Record<string, number> = {};
    for (const p of availableForSlot) {
      const sl = p.skillLevel || "?";
      poolBySkill[sl] = (poolBySkill[sl] ?? 0) + 1;
    }
    const poolBreakdown = Object.entries(poolBySkill)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([level, count]) => `${count}${level}`)
      .join(", ");
    if (poolBreakdown) {
      gameNotes.push(`Available pool by skill: ${poolBreakdown}`);
    }

    return NextResponse.json({
      game: {
        gameNumber: game.gameNumber,
        date: game.date,
        dayOfWeek: DAYS[game.dayOfWeek],
        startTime: game.startTime,
        courtNumber: game.courtNumber,
        group: game.group,
        status: game.status,
        weekNumber: game.weekNumber,
      },
      composition,
      players: playerExplanations,
      notes: gameNotes,
    });
  } catch (err) {
    console.error("[explain GET] error:", err);
    return NextResponse.json({ error: "Failed to explain game: " + String(err) }, { status: 500 });
  }
}
