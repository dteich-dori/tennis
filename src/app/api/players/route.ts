import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players, playerBlockedDays, playerVacations, playerDoNotPair, playerGroupMembers, gameAssignments, seasons } from "@/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";
import { formatPhone } from "@/lib/formatPhone";
import { downgradeContractIfNeeded, clampDaysPerWeek } from "@/lib/playerAvailability";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PlayerBody = any;

// Player data changes constantly (active/inactive toggles, edits) and
// must never be served from a stale cache — force this route to be
// evaluated fresh on every request.
export const dynamic = "force-dynamic";

/**
 * Resolve / sanitise the incoming groupAnchorId value.
 *
 * Rules (v1.134, v1.240 — cGamesOk retired in favor of cGamesLimit):
 *   - Anchor must be a C-level player.
 *   - A member may be: any C player, OR an A/B player whose cGamesLimit
 *     isn't 0 (0 = explicitly shielded from C games).
 *   - A player can't be their own anchor.
 *   - Anything that fails the rules is forced to null silently.
 */
async function validatedGroupAnchor(
  database: Awaited<ReturnType<typeof db>>,
  incoming: unknown,
  skillLevel: string | null | undefined,
  cGamesLimit: number | null | undefined,
  selfPlayerId?: number
): Promise<number | null> {
  if (incoming == null) return null;
  const anchorId = Number(incoming);
  if (!Number.isInteger(anchorId) || anchorId <= 0) return null;
  if (selfPlayerId != null && anchorId === selfPlayerId) return null;
  // Eligibility to be a MEMBER:
  //   - C players: always
  //   - A/B players: cGamesLimit must not be 0 (0 = shielded)
  //   - Subs/other: never
  const isC = skillLevel === "C";
  const isAB = skillLevel === "A" || skillLevel === "B";
  if (!isC && !(isAB && cGamesLimit !== 0)) return null;
  const [anchor] = await database
    .select({ id: players.id, skillLevel: players.skillLevel })
    .from(players)
    .where(eq(players.id, anchorId));
  if (!anchor || anchor.skillLevel !== "C") return null;
  return anchor.id;
}

/**
 * Bump seasons.lastPlayerChangeAt — called after every successful player
 * add / update / delete. Lets the Schedule page warn when the schedule is
 * potentially stale relative to the current player roster.
 */
async function markPlayerChange(
  database: Awaited<ReturnType<typeof db>>,
  seasonId: number
): Promise<void> {
  try {
    await database
      .update(seasons)
      .set({ lastPlayerChangeAt: new Date().toISOString() })
      .where(eq(seasons.id, seasonId));
  } catch (err) {
    // Non-fatal — don't break the player CRUD if the timestamp write fails.
    console.error("[markPlayerChange] failed:", err);
  }
}

const VALID_FREQUENCIES = ["0", "1", "1+", "2", "2+"];
const VALID_SKILL_LEVELS = ["A", "B", "C", "D"];
function validatePlayerFields(body: PlayerBody): string | null {
  if (!body.seasonId || typeof body.seasonId !== "number") return "seasonId is required";
  if (!body.firstName?.trim()) return "firstName is required";
  if (!body.lastName?.trim()) return "lastName is required";
  if (body.contractedFrequency && !VALID_FREQUENCIES.includes(body.contractedFrequency)) {
    return `contractedFrequency must be one of: ${VALID_FREQUENCIES.join(", ")}`;
  }
  if (body.skillLevel && !VALID_SKILL_LEVELS.includes(body.skillLevel)) {
    return `skillLevel must be one of: ${VALID_SKILL_LEVELS.join(", ")}`;
  }
  if (body.soloGames !== undefined && body.soloGames !== null) {
    const n = Number(body.soloGames);
    if (!Number.isInteger(n) || n < 1 || n > 36) return "soloGames must be an integer between 1 and 36";
  }
  if (body.preassignedGamesWanted !== undefined && body.preassignedGamesWanted !== null) {
    const n = Number(body.preassignedGamesWanted);
    if (!Number.isInteger(n) || n < 1 || n > 50) return "preassignedGamesWanted must be an integer between 1 and 50";
  }
  if (body.lockedExtraGames !== undefined && body.lockedExtraGames !== null) {
    const n = Number(body.lockedExtraGames);
    if (!Number.isInteger(n) || n < 0) return "lockedExtraGames must be a non-negative integer or null";
  }
  if (body.blockedDays) {
    for (const day of body.blockedDays) {
      if (typeof day !== "number" || day < 0 || day > 6) return "blockedDays must contain values 0-6";
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const allPlayers = await database
      .select()
      .from(players)
      .where(eq(players.seasonId, parseInt(seasonId)));

    // Fetch all related data in 3 bulk queries (not 3 per player)
    const playerIds = allPlayers.map((p) => p.id);

    let allBlockedDays: { id: number; playerId: number; dayOfWeek: number }[] = [];
    let allVacations: { id: number; playerId: number; startDate: string; endDate: string }[] = [];
    let allDoNotPair: { id: number; playerId: number; pairedPlayerId: number }[] = [];
    let allGroupMembers: { id: number; playerId: number; memberId: number }[] = [];

    if (playerIds.length > 0) {
      allBlockedDays = await database
        .select()
        .from(playerBlockedDays)
        .where(inArray(playerBlockedDays.playerId, playerIds));

      allVacations = await database
        .select()
        .from(playerVacations)
        .where(inArray(playerVacations.playerId, playerIds));

      allDoNotPair = await database
        .select()
        .from(playerDoNotPair)
        .where(inArray(playerDoNotPair.playerId, playerIds));

      allGroupMembers = await database
        .select()
        .from(playerGroupMembers)
        .where(inArray(playerGroupMembers.playerId, playerIds));
    }

    // Group by playerId in memory
    const blockedByPlayer = new Map<number, number[]>();
    for (const bd of allBlockedDays) {
      const arr = blockedByPlayer.get(bd.playerId) ?? [];
      arr.push(bd.dayOfWeek);
      blockedByPlayer.set(bd.playerId, arr);
    }

    const vacsByPlayer = new Map<number, typeof allVacations>();
    for (const v of allVacations) {
      const arr = vacsByPlayer.get(v.playerId) ?? [];
      arr.push(v);
      vacsByPlayer.set(v.playerId, arr);
    }

    const dnpByPlayer = new Map<number, number[]>();
    for (const d of allDoNotPair) {
      const arr = dnpByPlayer.get(d.playerId) ?? [];
      arr.push(d.pairedPlayerId);
      dnpByPlayer.set(d.playerId, arr);
    }

    const gmByPlayer = new Map<number, number[]>();
    for (const gm of allGroupMembers) {
      const arr = gmByPlayer.get(gm.playerId) ?? [];
      arr.push(gm.memberId);
      gmByPlayer.set(gm.playerId, arr);
    }

    const playersWithDetails = allPlayers.map((player) => ({
      ...player,
      blockedDays: blockedByPlayer.get(player.id) ?? [],
      vacations: vacsByPlayer.get(player.id) ?? [],
      doNotPair: dnpByPlayer.get(player.id) ?? [],
      groupMembers: gmByPlayer.get(player.id) ?? [],
    }));

    return NextResponse.json(playersWithDetails);
  } catch (err) {
    console.error("[players GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load players" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PlayerBody;
    const {
      seasonId,
      firstName,
      lastName,
      cellNumber,
      homeNumber,
      email,
      carrier,
      isActive,
      contractedFrequency,
      skillLevel,
      noConsecutiveDays,
      noEarlyGames,
      noVacationMakeup,
      cGamesLimit,
      soloGames,
      blockedDays,
      vacations,
      doNotPair,
      groupPct,
      groupMembers,
      preassignedGamesWanted,
      lockedExtraGames,
      excludedFromAutoAssign,
      groupAnchorId,
      smsOptOut,
    } = body;

    const validationError = validatePlayerFields(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const database = await db();

    // Check for duplicate name (first + last)
    const nameDup = await database
      .select()
      .from(players)
      .where(
        and(
          eq(players.seasonId, seasonId),
          eq(players.firstName, firstName),
          eq(players.lastName, lastName)
        )
      );
    if (nameDup.length > 0) {
      return NextResponse.json(
        { error: `A player named ${firstName} ${lastName} already exists.` },
        { status: 409 }
      );
    }

    // Check for duplicate email
    if (email) {
      const emailDup = await database
        .select()
        .from(players)
        .where(
          and(
            eq(players.seasonId, seasonId),
            eq(players.email, email)
          )
        );
      if (emailDup.length > 0) {
        return NextResponse.json(
          { error: `A player with email ${email} already exists.` },
          { status: 409 }
        );
      }
    }

    // Auto-downgrade "+ tier" contracts when the player's availability
    // (blockedDays vs season.daysPerWeek) leaves no room for extras.
    const incomingFreq = contractedFrequency ?? "1";
    const blockedDayList: number[] = Array.isArray(blockedDays) ? blockedDays : [];
    const [seasonRow] = await database
      .select({ daysPerWeek: seasons.daysPerWeek })
      .from(seasons)
      .where(eq(seasons.id, seasonId));
    const daysPerWeek = clampDaysPerWeek(seasonRow?.daysPerWeek ?? 5);
    const effectiveFreq = downgradeContractIfNeeded(
      incomingFreq,
      blockedDayList,
      daysPerWeek
    );
    const autoDowngraded = effectiveFreq !== incomingFreq;

    const result = await database
      .insert(players)
      .values({
        seasonId,
        firstName,
        lastName,
        cellNumber: cellNumber ? formatPhone(cellNumber) : cellNumber,
        homeNumber: homeNumber ? formatPhone(homeNumber) : homeNumber,
        email,
        carrier: carrier || null,
        isActive: isActive ?? true,
        contractedFrequency: effectiveFreq,
        skillLevel: skillLevel ?? "C",
        noConsecutiveDays: noConsecutiveDays ?? false,
        noEarlyGames: noEarlyGames ?? false,
        noVacationMakeup: noVacationMakeup ?? false,
        cGamesLimit: cGamesLimit !== undefined ? cGamesLimit : null,
        soloGames: soloGames || null,
        groupPct: groupPct ?? 0,
        preassignedGamesWanted: preassignedGamesWanted || null,
        lockedExtraGames: lockedExtraGames ?? null,
        excludedFromAutoAssign: excludedFromAutoAssign ?? false,
        smsOptOut: !!smsOptOut,
        smsOptOutAt: smsOptOut ? new Date().toISOString() : null,
        smsOptOutReason: smsOptOut ? "Set at player creation" : null,
        // Group anchor: enforce eligibility rules at write time.
        // - A/B players with cGamesLimit !== 0 may have an anchor
        //   pointing to a C player.
        // - Anyone else (subs, shielded (0), C players themselves) gets
        //   their anchor forced to null.
        groupAnchorId: await validatedGroupAnchor(
          database,
          groupAnchorId,
          skillLevel,
          cGamesLimit !== undefined ? cGamesLimit : null,
          undefined
        ),
      })
      .returning();

    const newPlayer = result[0];

    // Insert blocked days
    if (blockedDays?.length) {
      await database.insert(playerBlockedDays).values(
        blockedDays.map((day: number) => ({
          playerId: newPlayer.id,
          dayOfWeek: day,
        }))
      );
    }

    // Insert vacations (deduped)
    if (vacations?.length) {
      const uniqueVacations = Array.from(
        new Map(
          (vacations as { startDate: string; endDate: string }[]).map((v) => [`${v.startDate}|${v.endDate}`, v])
        ).values()
      );
      await database.insert(playerVacations).values(
        uniqueVacations.map((v) => ({
          playerId: newPlayer.id,
          startDate: v.startDate,
          endDate: v.endDate,
        }))
      );
    }

    // Insert do-not-pair
    if (doNotPair?.length) {
      await database.insert(playerDoNotPair).values(
        doNotPair.map((pairedId: number) => ({
          playerId: newPlayer.id,
          pairedPlayerId: pairedId,
        }))
      );
    }

    // Insert group members
    if (groupMembers?.length) {
      await database.insert(playerGroupMembers).values(
        groupMembers.map((memberId: number) => ({
          playerId: newPlayer.id,
          memberId,
        }))
      );
    }

    await markPlayerChange(database, seasonId);
    return NextResponse.json(
      autoDowngraded
        ? {
            ...newPlayer,
            autoDowngraded: true,
            originalContract: incomingFreq,
          }
        : newPlayer,
      { status: 201 }
    );
  } catch (err) {
    console.error("[players POST] error:", err);
    return NextResponse.json(
      { error: "Failed to create player" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as PlayerBody;
    const {
      id,
      firstName,
      lastName,
      cellNumber,
      homeNumber,
      email,
      carrier,
      isActive,
      contractedFrequency,
      skillLevel,
      noConsecutiveDays,
      noEarlyGames,
      noVacationMakeup,
      cGamesLimit,
      soloGames,
      blockedDays,
      vacations,
      doNotPair,
      groupPct,
      groupMembers,
      preassignedGamesWanted,
      lockedExtraGames,
      excludedFromAutoAssign,
      groupAnchorId,
      smsOptOut,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const database = await db();

    // Load current player — needed for merge and duplicate checks
    const [currentPlayer] = await database
      .select()
      .from(players)
      .where(eq(players.id, id));

    if (!currentPlayer) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Merge: use incoming value if provided, otherwise keep existing value
    const merged = {
      firstName: firstName ?? currentPlayer.firstName,
      lastName: lastName ?? currentPlayer.lastName,
      cellNumber: cellNumber !== undefined ? (cellNumber ? formatPhone(cellNumber) : cellNumber) : currentPlayer.cellNumber,
      homeNumber: homeNumber !== undefined ? (homeNumber ? formatPhone(homeNumber) : homeNumber) : currentPlayer.homeNumber,
      email: email !== undefined ? email : currentPlayer.email,
      carrier: carrier !== undefined ? (carrier || null) : currentPlayer.carrier,
      isActive: isActive !== undefined ? isActive : currentPlayer.isActive,
      contractedFrequency: contractedFrequency ?? currentPlayer.contractedFrequency,
      skillLevel: skillLevel ?? currentPlayer.skillLevel,
      noConsecutiveDays: noConsecutiveDays !== undefined ? noConsecutiveDays : currentPlayer.noConsecutiveDays,
      noEarlyGames: noEarlyGames !== undefined ? noEarlyGames : currentPlayer.noEarlyGames,
      noVacationMakeup: noVacationMakeup !== undefined ? noVacationMakeup : currentPlayer.noVacationMakeup,
      cGamesLimit: cGamesLimit !== undefined ? cGamesLimit : currentPlayer.cGamesLimit,
      soloGames: soloGames !== undefined ? (soloGames || null) : currentPlayer.soloGames,
      groupPct: groupPct !== undefined ? groupPct : currentPlayer.groupPct,
      preassignedGamesWanted:
        preassignedGamesWanted !== undefined
          ? (preassignedGamesWanted || null)
          : currentPlayer.preassignedGamesWanted,
      lockedExtraGames:
        lockedExtraGames !== undefined
          ? (lockedExtraGames === null ? null : lockedExtraGames)
          : currentPlayer.lockedExtraGames,
      excludedFromAutoAssign:
        excludedFromAutoAssign !== undefined
          ? excludedFromAutoAssign
          : currentPlayer.excludedFromAutoAssign,
      // SMS opt-out flag from the "Do not text" checkbox on the player
      // form. If the value changed, stamp the timestamp + a descriptive
      // reason so it can be told apart from webhook / /sms-opt-outs
      // driven changes.
      smsOptOut:
        smsOptOut !== undefined ? smsOptOut : currentPlayer.smsOptOut,
      smsOptOutAt:
        smsOptOut !== undefined && smsOptOut !== currentPlayer.smsOptOut
          ? new Date().toISOString()
          : currentPlayer.smsOptOutAt,
      smsOptOutReason:
        smsOptOut !== undefined && smsOptOut !== currentPlayer.smsOptOut
          ? (smsOptOut
              ? "Do-not-text toggled on via player form"
              : "Do-not-text toggled off via player form")
          : currentPlayer.smsOptOutReason,
      // Group anchor — same eligibility rule as on POST. Note that any
      // edit that sets cGamesLimit to 0 (or changes skill away from
      // A/B) auto-clears the anchor.
      groupAnchorId: await validatedGroupAnchor(
        database,
        groupAnchorId !== undefined ? groupAnchorId : currentPlayer.groupAnchorId,
        skillLevel ?? currentPlayer.skillLevel,
        cGamesLimit !== undefined ? cGamesLimit : currentPlayer.cGamesLimit,
        id
      ),
    };

    // Auto-downgrade "+ tier" when the resulting blocked-day set leaves no
    // room for extras. blockedDays may be the incoming request value OR
    // the current DB value if the update didn't touch them.
    let effectiveBlockedDays: number[];
    if (Array.isArray(blockedDays)) {
      effectiveBlockedDays = blockedDays;
    } else {
      const existingBlocked = await database
        .select({ dayOfWeek: playerBlockedDays.dayOfWeek })
        .from(playerBlockedDays)
        .where(eq(playerBlockedDays.playerId, id));
      effectiveBlockedDays = existingBlocked.map((b) => b.dayOfWeek);
    }
    const [seasonRowPut] = await database
      .select({ daysPerWeek: seasons.daysPerWeek })
      .from(seasons)
      .where(eq(seasons.id, currentPlayer.seasonId));
    const daysPerWeekPut = clampDaysPerWeek(seasonRowPut?.daysPerWeek ?? 5);
    const requestedFreq = merged.contractedFrequency;
    const finalFreq = downgradeContractIfNeeded(
      requestedFreq,
      effectiveBlockedDays,
      daysPerWeekPut
    );
    const autoDowngraded = finalFreq !== requestedFreq;
    merged.contractedFrequency = finalFreq;

    // Check for duplicate name (excluding this player, scoped to season)
    const nameDup = await database
      .select()
      .from(players)
      .where(
        and(
          eq(players.seasonId, currentPlayer.seasonId),
          ne(players.id, id),
          eq(players.firstName, merged.firstName),
          eq(players.lastName, merged.lastName)
        )
      );
    if (nameDup.length > 0) {
      return NextResponse.json(
        { error: `A player named ${merged.firstName} ${merged.lastName} already exists.` },
        { status: 409 }
      );
    }

    // Check for duplicate email (excluding this player, scoped to season)
    if (merged.email) {
      const emailDup = await database
        .select()
        .from(players)
        .where(
          and(
            eq(players.seasonId, currentPlayer.seasonId),
            ne(players.id, id),
            eq(players.email, merged.email)
          )
        );
      if (emailDup.length > 0) {
        return NextResponse.json(
          { error: `A player with email ${merged.email} already exists.` },
          { status: 409 }
        );
      }
    }

    await database
      .update(players)
      .set(merged)
      .where(eq(players.id, id));

    // Replace blocked days
    if (blockedDays !== undefined) {
      await database.delete(playerBlockedDays).where(eq(playerBlockedDays.playerId, id));
      if (blockedDays.length) {
        await database.insert(playerBlockedDays).values(
          blockedDays.map((day: number) => ({ playerId: id, dayOfWeek: day }))
        );
      }
    }

    // Replace vacations (deduped — a double-submit shouldn't leave two
    // identical rows for the same date range)
    if (vacations !== undefined) {
      await database.delete(playerVacations).where(eq(playerVacations.playerId, id));
      const uniqueVacations = Array.from(
        new Map(
          (vacations as { startDate: string; endDate: string }[]).map((v) => [`${v.startDate}|${v.endDate}`, v])
        ).values()
      );
      if (uniqueVacations.length) {
        await database.insert(playerVacations).values(
          uniqueVacations.map((v) => ({
            playerId: id,
            startDate: v.startDate,
            endDate: v.endDate,
          }))
        );
      }
    }

    // Replace do-not-pair
    if (doNotPair !== undefined) {
      await database.delete(playerDoNotPair).where(eq(playerDoNotPair.playerId, id));
      if (doNotPair.length) {
        await database.insert(playerDoNotPair).values(
          doNotPair.map((pairedId: number) => ({ playerId: id, pairedPlayerId: pairedId }))
        );
      }
    }

    // Replace group members
    if (groupMembers !== undefined) {
      await database.delete(playerGroupMembers).where(eq(playerGroupMembers.playerId, id));
      if (groupMembers.length) {
        await database.insert(playerGroupMembers).values(
          groupMembers.map((memberId: number) => ({ playerId: id, memberId }))
        );
      }
    }

    await markPlayerChange(database, currentPlayer.seasonId);
    return NextResponse.json({
      success: true,
      ...(autoDowngraded
        ? { autoDowngraded: true, originalContract: requestedFreq, finalContract: finalFreq }
        : {}),
    });
  } catch (err) {
    console.error("[players PUT] error:", err);
    return NextResponse.json(
      { error: "Failed to update player" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const playerId = parseInt(id);
    const database = await db();

    // Grab seasonId BEFORE the delete so we can bump the season's
    // lastPlayerChangeAt after the cascade.
    const [doomed] = await database
      .select({ seasonId: players.seasonId })
      .from(players)
      .where(eq(players.id, playerId));

    await database.delete(gameAssignments).where(eq(gameAssignments.playerId, playerId));
    await database.delete(playerBlockedDays).where(eq(playerBlockedDays.playerId, playerId));
    await database.delete(playerVacations).where(eq(playerVacations.playerId, playerId));
    await database.delete(playerDoNotPair).where(eq(playerDoNotPair.playerId, playerId));
    await database.delete(playerGroupMembers).where(eq(playerGroupMembers.playerId, playerId));
    await database.delete(playerGroupMembers).where(eq(playerGroupMembers.memberId, playerId));
    // Clear group_anchor_id from anyone who had this player as their anchor
    await database
      .update(players)
      .set({ groupAnchorId: null })
      .where(eq(players.groupAnchorId, playerId));
    await database.delete(players).where(eq(players.id, playerId));

    if (doomed) await markPlayerChange(database, doomed.seasonId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[players DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to delete player" },
      { status: 500 }
    );
  }
}
