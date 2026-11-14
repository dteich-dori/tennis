import { NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, gameAssignments, gameHandoffs, players, seasons } from "@/db/schema";
import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { todayEt } from "@/lib/swapAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/games/recent-changes
 * The latest swaps and give-aways whose games have not been played yet, each
 * with the body that /api/games/swap-notify or /api/games/handoff-notify
 * takes, so a notice can be sent again from the Swap tab.
 *
 * A swap is read from the swap serial both its assignment rows carry. After
 * a swap, p1 holds g1 and p2 holds g2, and each took the other's game, so
 * playerA = p1 now holds gameB = g1, playerB = p2 now holds gameA = g2.
 */
export async function GET() {
  try {
    const database = await db();
    const [season] = await database.select().from(seasons).orderBy(desc(seasons.id)).limit(1);
    if (!season) return NextResponse.json([]);
    const today = todayEt();

    const rows = await database
      .select({ id: gameAssignments.id, gameId: gameAssignments.gameId, playerId: gameAssignments.playerId, serial: gameAssignments.swapSerial })
      .from(gameAssignments).innerJoin(games, eq(games.id, gameAssignments.gameId))
      .where(eq(games.seasonId, season.id));
    const bySerial = new Map<number, typeof rows>();
    for (const r of rows) {
      if (r.serial == null) continue;
      bySerial.set(r.serial, [...(bySerial.get(r.serial) ?? []), r]);
    }
    const pairs = [...bySerial.entries()].filter(([, v]) => v.length === 2).sort((a, b) => b[0] - a[0]).slice(0, 40);

    const hand = await database
      .select().from(gameHandoffs).innerJoin(games, eq(games.id, gameHandoffs.gameId))
      .where(eq(games.seasonId, season.id)).orderBy(desc(gameHandoffs.createdAt)).limit(40);

    const gameIds = [...new Set([...pairs.flatMap(([, v]) => v.map((r) => r.gameId)), ...hand.map((h) => h.game_handoffs.gameId)])];
    const playerIds = [...new Set([...pairs.flatMap(([, v]) => v.map((r) => r.playerId)), ...hand.flatMap((h) => [h.game_handoffs.fromPlayerId, h.game_handoffs.toPlayerId])])];
    const gRows = gameIds.length ? await database.select().from(games).where(inArray(games.id, gameIds)) : [];
    const pRows = playerIds.length ? await database.select().from(players).where(inArray(players.id, playerIds)) : [];
    const g = new Map(gRows.map((x) => [x.id, x]));
    const nm = (id: number) => { const p = pRows.find((x) => x.id === id); return p ? `${p.firstName} ${p.lastName}` : String(id); };
    const gl = (id: number) => { const x = g.get(id)!; return `Game #${x.gameNumber} ${x.date}`; };

    const out: { key: string; kind: "swap" | "handoff"; summary: string; payload: unknown }[] = [];
    for (const [serial, [r1, r2]] of pairs) {
      if (g.get(r1.gameId)!.date < today && g.get(r2.gameId)!.date < today) continue;
      out.push({
        key: `swap-${serial}`, kind: "swap",
        summary: `${nm(r1.playerId)} ↔ ${nm(r2.playerId)}: now ${nm(r1.playerId)} ${gl(r1.gameId)}, ${nm(r2.playerId)} ${gl(r2.gameId)}`,
        payload: { gameAId: r2.gameId, playerAId: r1.playerId, gameBId: r1.gameId, playerBId: r2.playerId },
      });
    }
    for (const row of hand) {
      const h = row.game_handoffs;
      if (g.get(h.gameId)!.date < today) continue;
      out.push({
        key: `handoff-${h.id}`, kind: "handoff",
        summary: `${nm(h.fromPlayerId)} gave ${gl(h.gameId)} to ${nm(h.toPlayerId)}`,
        payload: { gameId: h.gameId, fromPlayerId: h.fromPlayerId, toPlayerId: h.toPlayerId },
      });
    }
    return NextResponse.json(out);
  } catch (err) {
    console.error("[games/recent-changes] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
