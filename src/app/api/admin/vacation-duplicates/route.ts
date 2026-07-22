import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { playerVacations, players, seasons } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * GET  /api/admin/vacation-duplicates?seasonId=N   diagnose
 * POST /api/admin/vacation-duplicates?seasonId=N   collapse duplicates
 *
 * Finds player_vacations rows where the same {playerId, startDate,
 * endDate} triple appears more than once. Returns a per-player report.
 * POST additionally deletes the extras, keeping the lowest-id row for
 * each triple so the vacation record stays intact.
 */

async function findDuplicates(seasonId: number) {
  const database = await db();
  const playerRows = await database
    .select({ id: players.id, firstName: players.firstName, lastName: players.lastName })
    .from(players)
    .where(and(eq(players.seasonId, seasonId), eq(players.isActive, true)));
  const playerIds = playerRows.map((p) => p.id);
  if (playerIds.length === 0) return { affected: [] as { playerId: number; name: string; dupes: { startDate: string; endDate: string; ids: number[] }[] }[] };

  const vacs = await database.select().from(playerVacations).where(inArray(playerVacations.playerId, playerIds));
  const buckets = new Map<string, { playerId: number; startDate: string; endDate: string; ids: number[] }>();
  for (const v of vacs) {
    const key = `${v.playerId}|${v.startDate}|${v.endDate}`;
    const existing = buckets.get(key);
    if (existing) existing.ids.push(v.id);
    else buckets.set(key, { playerId: v.playerId, startDate: v.startDate, endDate: v.endDate, ids: [v.id] });
  }
  const affected: { playerId: number; name: string; dupes: { startDate: string; endDate: string; ids: number[] }[] }[] = [];
  const byPlayer = new Map<number, { startDate: string; endDate: string; ids: number[] }[]>();
  for (const b of buckets.values()) {
    if (b.ids.length < 2) continue;
    const arr = byPlayer.get(b.playerId) ?? [];
    arr.push({ startDate: b.startDate, endDate: b.endDate, ids: b.ids.sort((a, b) => a - b) });
    byPlayer.set(b.playerId, arr);
  }
  for (const [pid, dupes] of byPlayer) {
    const p = playerRows.find((x) => x.id === pid);
    affected.push({ playerId: pid, name: p ? `${p.firstName} ${p.lastName}` : `player #${pid}`, dupes });
  }
  return { affected };
}

export async function GET(request: NextRequest) {
  try {
    const seasonIdParam = request.nextUrl.searchParams.get("seasonId");
    const database = await db();
    let seasonId = seasonIdParam ? parseInt(seasonIdParam) : null;
    if (!seasonId) {
      const s = await database.select({ id: seasons.id }).from(seasons);
      seasonId = s.length > 0 ? s[s.length - 1].id : null;
    }
    if (!seasonId) return NextResponse.json({ error: "No season." }, { status: 400 });
    const report = await findDuplicates(seasonId);
    return NextResponse.json({ seasonId, ...report });
  } catch (err) {
    console.error("[vacation-duplicates GET] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const seasonIdParam = request.nextUrl.searchParams.get("seasonId");
    const database = await db();
    let seasonId = seasonIdParam ? parseInt(seasonIdParam) : null;
    if (!seasonId) {
      const s = await database.select({ id: seasons.id }).from(seasons);
      seasonId = s.length > 0 ? s[s.length - 1].id : null;
    }
    if (!seasonId) return NextResponse.json({ error: "No season." }, { status: 400 });
    const { affected } = await findDuplicates(seasonId);
    const toDelete: number[] = [];
    for (const a of affected) {
      for (const d of a.dupes) {
        // Keep the lowest id, drop the rest
        toDelete.push(...d.ids.slice(1));
      }
    }
    if (toDelete.length > 0) {
      await database.delete(playerVacations).where(inArray(playerVacations.id, toDelete));
    }
    return NextResponse.json({ seasonId, deleted: toDelete.length, affectedPlayers: affected.length });
  } catch (err) {
    console.error("[vacation-duplicates POST] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
