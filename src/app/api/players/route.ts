import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players, playerBlockedDays, playerVacations, playerDoNotPair, playerSoloPairs, gameAssignments } from "@/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";
import { formatPhone } from "@/lib/formatPhone";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PlayerBody = any;

const VALID_FREQUENCIES = ["0", "1", "2", "2+"];
const VALID_SKILL_LEVELS = ["A", "B", "C", "D"];
const VALID_SOLO_SHARE_LEVELS = ["full", "half", null];

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
  if (body.soloShareLevel !== undefined && body.soloShareLevel !== null && !VALID_SOLO_SHARE_LEVELS.includes(body.soloShareLevel)) {
    return `soloShareLevel must be one of: ${VALID_SOLO_SHARE_LEVELS.filter(Boolean).join(", ")}`;
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
    let allSoloPairs: { id: number; playerId: number; pairedPlayerId: number }[] = [];

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

      allSoloPairs = await database
        .select()
        .from(playerSoloPairs)
        .where(inArray(playerSoloPairs.playerId, playerIds));
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

    const soloPairByPlayer = new Map<number, number>();
    for (const sp of allSoloPairs) {
      soloPairByPlayer.set(sp.playerId, sp.pairedPlayerId);
    }

    const playersWithDetails = allPlayers.map((player) => ({
      ...player,
      blockedDays: blockedByPlayer.get(player.id) ?? [],
      vacations: vacsByPlayer.get(player.id) ?? [],
      doNotPair: dnpByPlayer.get(player.id) ?? [],
      soloPairId: soloPairByPlayer.get(player.id) ?? null,
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
      isActive,
      contractedFrequency,
      skillLevel,
      noConsecutiveDays,
      isDerated,
      noEarlyGames,
      soloShareLevel,
      blockedDays,
      vacations,
      doNotPair,
      soloPairId,
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

    const result = await database
      .insert(players)
      .values({
        seasonId,
        firstName,
        lastName,
        cellNumber: cellNumber ? formatPhone(cellNumber) : cellNumber,
        homeNumber: homeNumber ? formatPhone(homeNumber) : homeNumber,
        email,
        isActive: isActive ?? true,
        contractedFrequency: contractedFrequency ?? "1",
        skillLevel: skillLevel ?? "C",
        noConsecutiveDays: noConsecutiveDays ?? false,
        isDerated: isDerated ?? false,
        noEarlyGames: noEarlyGames ?? false,
        soloShareLevel,
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

    // Insert vacations
    if (vacations?.length) {
      await database.insert(playerVacations).values(
        vacations.map((v: { startDate: string; endDate: string }) => ({
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

    // Insert solo pair (bidirectional)
    if (soloPairId) {
      // Remove any existing pair the partner has
      await database.delete(playerSoloPairs).where(eq(playerSoloPairs.playerId, soloPairId));
      await database.delete(playerSoloPairs).where(eq(playerSoloPairs.pairedPlayerId, soloPairId));
      // Create bidirectional link
      await database.insert(playerSoloPairs).values([
        { playerId: newPlayer.id, pairedPlayerId: soloPairId },
        { playerId: soloPairId, pairedPlayerId: newPlayer.id },
      ]);
    }

    return NextResponse.json(newPlayer, { status: 201 });
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
      isActive,
      contractedFrequency,
      skillLevel,
      noConsecutiveDays,
      isDerated,
      noEarlyGames,
      soloShareLevel,
      blockedDays,
      vacations,
      doNotPair,
      soloPairId,
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
      isActive: isActive !== undefined ? isActive : currentPlayer.isActive,
      contractedFrequency: contractedFrequency ?? currentPlayer.contractedFrequency,
      skillLevel: skillLevel ?? currentPlayer.skillLevel,
      noConsecutiveDays: noConsecutiveDays !== undefined ? noConsecutiveDays : currentPlayer.noConsecutiveDays,
      isDerated: isDerated !== undefined ? isDerated : currentPlayer.isDerated,
      noEarlyGames: noEarlyGames !== undefined ? noEarlyGames : currentPlayer.noEarlyGames,
      soloShareLevel: soloShareLevel !== undefined ? soloShareLevel : currentPlayer.soloShareLevel,
    };

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

    // Replace vacations
    if (vacations !== undefined) {
      await database.delete(playerVacations).where(eq(playerVacations.playerId, id));
      if (vacations.length) {
        await database.insert(playerVacations).values(
          vacations.map((v: { startDate: string; endDate: string }) => ({
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

    // Replace solo pair (bidirectional)
    if (soloPairId !== undefined) {
      // Remove all existing solo pair links for this player (both directions)
      await database.delete(playerSoloPairs).where(eq(playerSoloPairs.playerId, id));
      await database.delete(playerSoloPairs).where(eq(playerSoloPairs.pairedPlayerId, id));

      if (soloPairId) {
        // Remove any existing pair the new partner has
        await database.delete(playerSoloPairs).where(eq(playerSoloPairs.playerId, soloPairId));
        await database.delete(playerSoloPairs).where(eq(playerSoloPairs.pairedPlayerId, soloPairId));
        // Create bidirectional link
        await database.insert(playerSoloPairs).values([
          { playerId: id, pairedPlayerId: soloPairId },
          { playerId: soloPairId, pairedPlayerId: id },
        ]);
      }
    }

    return NextResponse.json({ success: true });
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

    await database.delete(gameAssignments).where(eq(gameAssignments.playerId, playerId));
    await database.delete(playerBlockedDays).where(eq(playerBlockedDays.playerId, playerId));
    await database.delete(playerVacations).where(eq(playerVacations.playerId, playerId));
    await database.delete(playerDoNotPair).where(eq(playerDoNotPair.playerId, playerId));
    await database.delete(playerSoloPairs).where(eq(playerSoloPairs.playerId, playerId));
    await database.delete(playerSoloPairs).where(eq(playerSoloPairs.pairedPlayerId, playerId));
    await database.delete(players).where(eq(players.id, playerId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[players DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to delete player" },
      { status: 500 }
    );
  }
}
