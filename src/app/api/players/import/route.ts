import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players, playerBlockedDays, playerVacations, playerDoNotPair } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { formatPhone } from "@/lib/formatPhone";

interface ImportPlayer {
  firstName: string;
  lastName: string;
  cellNumber: string | null;
  homeNumber: string | null;
  email: string | null;
  // Full backup fields (optional — only present when importing our own CSV export)
  skillLevel?: string | null;
  contractedFrequency?: string | null;
  soloGames?: number | null;
  isActive?: boolean | null;
  isDerated?: boolean | null;
  noConsecutiveDays?: boolean | null;
  noEarlyGames?: boolean | null;
  blockedDays?: number[];
  vacations?: { startDate: string; endDate: string }[];
  doNotPairNames?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId: number;
      players: ImportPlayer[];
      isFullBackup?: boolean;
    };
    const { seasonId, players: importPlayers, isFullBackup } = body;

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

    // First pass: insert/update all players
    const playerIdByName = new Map<string, number>();

    for (const p of importPlayers) {
      const nameKey = `${p.lastName.toLowerCase()}, ${p.firstName.toLowerCase()}`;

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
        const current = existing[0];
        playerIdByName.set(nameKey, current.id);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: Record<string, any> = {};

        // Basic fields — always update if provided
        if (p.cellNumber && formatPhone(p.cellNumber) !== current.cellNumber) {
          updates.cellNumber = formatPhone(p.cellNumber);
        }
        if (p.homeNumber && formatPhone(p.homeNumber) !== current.homeNumber) {
          updates.homeNumber = formatPhone(p.homeNumber);
        }
        if (p.email && p.email !== current.email) {
          updates.email = p.email;
        }

        // Full backup fields — update when restoring from backup
        if (isFullBackup) {
          if (p.skillLevel && p.skillLevel !== current.skillLevel) {
            updates.skillLevel = p.skillLevel;
          }
          if (p.contractedFrequency && p.contractedFrequency !== current.contractedFrequency) {
            updates.contractedFrequency = p.contractedFrequency;
          }
          if (p.soloGames !== undefined) {
            updates.soloGames = p.soloGames || null;
          }
          if (p.isActive !== null && p.isActive !== undefined && p.isActive !== current.isActive) {
            updates.isActive = p.isActive;
          }
          if (p.isDerated !== null && p.isDerated !== undefined && p.isDerated !== current.isDerated) {
            updates.isDerated = p.isDerated;
          }
          if (p.noConsecutiveDays !== null && p.noConsecutiveDays !== undefined && p.noConsecutiveDays !== current.noConsecutiveDays) {
            updates.noConsecutiveDays = p.noConsecutiveDays;
          }
          if (p.noEarlyGames !== null && p.noEarlyGames !== undefined && p.noEarlyGames !== current.noEarlyGames) {
            updates.noEarlyGames = p.noEarlyGames;
          }
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

        // Full backup: replace blocked days, vacations
        if (isFullBackup) {
          // Replace blocked days
          await database.delete(playerBlockedDays).where(eq(playerBlockedDays.playerId, current.id));
          if (p.blockedDays && p.blockedDays.length > 0) {
            await database.insert(playerBlockedDays).values(
              p.blockedDays.map((day) => ({ playerId: current.id, dayOfWeek: day }))
            );
          }

          // Replace vacations
          await database.delete(playerVacations).where(eq(playerVacations.playerId, current.id));
          if (p.vacations && p.vacations.length > 0) {
            await database.insert(playerVacations).values(
              p.vacations.map((v) => ({ playerId: current.id, startDate: v.startDate, endDate: v.endDate }))
            );
          }
        }
      } else {
        // New player — insert
        const result = await database.insert(players).values({
          seasonId,
          firstName: p.firstName,
          lastName: p.lastName,
          cellNumber: p.cellNumber ? formatPhone(p.cellNumber) : null,
          homeNumber: p.homeNumber ? formatPhone(p.homeNumber) : null,
          email: p.email || null,
          isActive: isFullBackup && p.isActive !== null && p.isActive !== undefined ? p.isActive : true,
          contractedFrequency: (isFullBackup && p.contractedFrequency) || "1",
          skillLevel: (isFullBackup && p.skillLevel) || "C",
          noConsecutiveDays: isFullBackup && p.noConsecutiveDays !== null && p.noConsecutiveDays !== undefined ? p.noConsecutiveDays : false,
          isDerated: isFullBackup && p.isDerated !== null && p.isDerated !== undefined ? p.isDerated : false,
          noEarlyGames: isFullBackup && p.noEarlyGames !== null && p.noEarlyGames !== undefined ? p.noEarlyGames : false,
          soloGames: isFullBackup ? (p.soloGames || null) : null,
        }).returning();

        const newPlayer = result[0];
        playerIdByName.set(nameKey, newPlayer.id);

        // Full backup: insert blocked days and vacations
        if (isFullBackup) {
          if (p.blockedDays && p.blockedDays.length > 0) {
            await database.insert(playerBlockedDays).values(
              p.blockedDays.map((day) => ({ playerId: newPlayer.id, dayOfWeek: day }))
            );
          }
          if (p.vacations && p.vacations.length > 0) {
            await database.insert(playerVacations).values(
              p.vacations.map((v) => ({ playerId: newPlayer.id, startDate: v.startDate, endDate: v.endDate }))
            );
          }
        }

        added++;
      }
    }

    // Second pass (full backup only): restore do-not-pair
    if (isFullBackup) {
      for (const p of importPlayers) {
        const nameKey = `${p.lastName.toLowerCase()}, ${p.firstName.toLowerCase()}`;
        const playerId = playerIdByName.get(nameKey);
        if (!playerId) continue;

        // Restore do-not-pair (names are "LastName, FirstName" separated by ";")
        if (p.doNotPairNames && p.doNotPairNames.length > 0) {
          await database.delete(playerDoNotPair).where(eq(playerDoNotPair.playerId, playerId));
          const dnpIds: number[] = [];
          for (const name of p.doNotPairNames) {
            const partnerId = playerIdByName.get(name.toLowerCase());
            if (partnerId) dnpIds.push(partnerId);
          }
          if (dnpIds.length > 0) {
            await database.insert(playerDoNotPair).values(
              dnpIds.map((pairedId) => ({ playerId, pairedPlayerId: pairedId }))
            );
          }
        }
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
