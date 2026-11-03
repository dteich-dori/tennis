import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { games, players, seasons, swapAdminLog } from "@/db/schema";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getSwapAdmin, todayEt } from "@/lib/swapAdmin";
import { loadSwapData } from "@/lib/swapData";
import { findSwapSuggestions, findHandoffCandidates, explainNoMatch } from "@/lib/swapSuggestions";
import { POST as swapPost } from "@/app/api/games/swap/route";
import { POST as handoffPost } from "@/app/api/games/handoff/route";
import { POST as swapNotifyPost } from "@/app/api/games/swap-notify/route";
import { POST as handoffNotifyPost } from "@/app/api/games/handoff-notify/route";

/**
 * Delegated swap admin — no login, the token in the URL is the credential.
 *
 * A delegate may ONLY swap games or give a game away, and may touch any
 * game that has not been played yet (including their own). Nothing else is
 * reachable from here. The writes go through the very same handlers the
 * admin Swap tab uses, so every eligibility rule applies identically; each
 * successful change is logged to swap_admin_log.
 *
 *   GET  ?op=players
 *   GET  ?op=games&playerId=N
 *   GET  ?op=swap-candidates&playerId=N&gameId=M[&back=4&ahead=6]
 *   GET  ?op=handoff-candidates&playerId=N&gameId=M
 *   POST { op: "swap" | "handoff" | "notify", ... }
 */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const nm = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

async function currentSeasonId() {
  const database = await db();
  const [s] = await database.select().from(seasons).orderBy(desc(seasons.id)).limit(1);
  return s?.id ?? null;
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    const me = await getSwapAdmin(token);
    if (!me) return bad("This link is not valid.", 401);
    const seasonId = await currentSeasonId();
    if (!seasonId) return bad("No season found", 404);
    const database = await db();
    const { swapPlayers, swapGames } = await loadSwapData(database, seasonId);
    const today = todayEt();
    const q = request.nextUrl.searchParams;
    const op = q.get("op") ?? "players";
    const upcoming = swapGames.filter((g) => g.status === "normal" && g.date >= today);

    if (op === "players") {
      const holders = new Set<number>();
      for (const g of upcoming) for (const a of g.assignments) holders.add(a.playerId);
      return NextResponse.json({
        me: nm(me),
        players: swapPlayers
          .filter((p) => p.isActive && holders.has(p.id))
          .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName }))
          .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
      });
    }

    const playerId = parseInt(q.get("playerId") ?? "", 10);
    const player = swapPlayers.find((p) => p.id === playerId);
    if (!player) return bad("Player not found", 404);

    if (op === "games") {
      return NextResponse.json({
        player: nm(player),
        games: upcoming
          .filter((g) => g.assignments.some((a) => a.playerId === playerId))
          .sort((a, b) => a.date.localeCompare(b.date) || a.gameNumber - b.gameNumber)
          .map((g) => ({
            id: g.id, gameNumber: g.gameNumber, date: g.date, dayOfWeek: g.dayOfWeek,
            startTime: g.startTime, courtNumber: g.courtNumber, group: g.group,
          })),
      });
    }

    const gameId = parseInt(q.get("gameId") ?? "", 10);
    const game = upcoming.find((g) => g.id === gameId);
    if (!game || !game.assignments.some((a) => a.playerId === playerId)) {
      return bad("That game is not available for this player.", 404);
    }
    const cells = new Map(
      (await database.select({ id: players.id, cell: players.cellNumber }).from(players).where(eq(players.seasonId, seasonId)))
        .map((r) => [r.id, r.cell])
    );
    const slim = (g: { id: number; gameNumber: number; date: string; dayOfWeek: number; startTime: string; courtNumber: number; weekNumber: number }) => ({
      id: g.id, gameNumber: g.gameNumber, date: g.date, dayOfWeek: g.dayOfWeek,
      startTime: g.startTime, courtNumber: g.courtNumber, weekNumber: g.weekNumber,
    });

    if (op === "swap-candidates") {
      const back = Math.min(Math.max(parseInt(q.get("back") ?? "4", 10) || 0, 0), 30);
      const ahead = Math.min(Math.max(parseInt(q.get("ahead") ?? "6", 10) || 0, 0), 30);
      const [season] = await database.select().from(seasons).where(eq(seasons.id, seasonId));
      const found = findSwapSuggestions({
        players: swapPlayers,
        games: swapGames.filter((g) => g.date >= today || g.id === game.id),
        playerAId: playerId, gameAId: gameId,
        totalWeeks: season.totalWeeks, weeksBack: back, weeksAhead: ahead, maxGamesPerPartner: 2,
      });
      return NextResponse.json({
        candidates: found.map((c) => ({
          player: { id: c.playerB.id, name: nm(c.playerB), cell: cells.get(c.playerB.id) ?? null },
          game: slim(c.gameY), weekDistance: c.weekDistance,
        })),
        reasons: found.length > 0 ? [] : explainNoMatch({
          players: swapPlayers, games: swapGames, playerAId: playerId, gameAId: gameId,
          totalWeeks: season.totalWeeks, weeksBack: back, weeksAhead: ahead, kind: "swap",
        }),
      });
    }

    if (op === "handoff-candidates") {
      const found = findHandoffCandidates({ players: swapPlayers, games: swapGames, playerAId: playerId, gameAId: gameId });
      return NextResponse.json({
        candidates: found.map((c) => ({
          player: { id: c.player.id, name: nm(c.player), cell: cells.get(c.player.id) ?? null },
          isSub: c.isSub,
        })),
        reasons: found.length > 0 ? [] : explainNoMatch({
          players: swapPlayers, games: swapGames, playerAId: playerId, gameAId: gameId,
          totalWeeks: 0, weeksBack: 0, weeksAhead: 0, kind: "handoff",
        }),
      });
    }
    return bad("Unknown op");
  } catch (err) {
    console.error("[swap-admin] GET error:", err);
    return bad(String(err), 500);
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    const me = await getSwapAdmin(token);
    if (!me) return bad("This link is not valid.", 401);
    const body = (await request.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const op = body.op as string;
    const database = await db();
    const today = todayEt();

    const forward = (handler: (r: NextRequest) => Promise<Response>, payload: unknown) =>
      handler(new NextRequest(request.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }));
    const gameRows = async (ids: number[]) =>
      database.select().from(games).where(inArray(games.id, ids));
    const log = async (action: string, summary: string) =>
      database.insert(swapAdminLog).values({
        delegatePlayerId: me.id, action, summary: `${summary} (by ${nm(me)})`, createdAt: new Date().toISOString(),
      });
    const gl = (g: { gameNumber: number; date: string }) => `Game #${g.gameNumber} ${g.date}`;

    if (op === "swap") {
      const { gameAId, playerAId, gameBId, playerBId } = body;
      const gs = await gameRows([gameAId, gameBId].filter(Boolean));
      if (gs.length !== 2 || gs.some((g) => g.date < today)) return bad("Games that have been played can't be changed.");
      const res = await forward(swapPost, { gameAId, playerAId, gameBId, playerBId });
      const data = await res.json();
      if (res.ok && data.success) {
        const a = data.swap.playerA, b = data.swap.playerB;
        await log("swap", `${nm(a)} ↔ ${nm(b)}: ${gl(data.swap.gameA)} / ${gl(data.swap.gameB)}`);
      }
      return NextResponse.json(data, { status: res.status });
    }

    if (op === "handoff") {
      const { gameId, fromPlayerId, toPlayerId } = body;
      const [g] = await gameRows([gameId]);
      if (!g || g.date < today) return bad("Games that have been played can't be changed.");
      const res = await forward(handoffPost, { gameId, fromPlayerId, toPlayerId });
      const data = await res.json();
      if (res.ok && data.success) {
        const ps = await database.select().from(players).where(inArray(players.id, [fromPlayerId, toPlayerId]));
        const f = ps.find((p) => p.id === fromPlayerId), t = ps.find((p) => p.id === toPlayerId);
        await log("handoff", `${f ? nm(f) : fromPlayerId} gave ${gl(g)} to ${t ? nm(t) : toPlayerId}`);
      }
      return NextResponse.json(data, { status: res.status });
    }

    if (op === "notify") {
      const kind = body.kind === "handoff" ? "handoff" : "swap";
      //  Notifying emails real people, so it is only open right after this
      //  delegate made a change of that kind — not as a mailer on its own.
      const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
      const recent = await database
        .select({ id: swapAdminLog.id })
        .from(swapAdminLog)
        .where(and(eq(swapAdminLog.delegatePlayerId, me.id), eq(swapAdminLog.action, kind), gt(swapAdminLog.createdAt, since)))
        .limit(1);
      if (recent.length === 0) return bad("Make a change first, then notify.", 403);
      const res = await forward(kind === "handoff" ? handoffNotifyPost : swapNotifyPost, body.payload);
      return NextResponse.json(await res.json(), { status: res.status });
    }
    return bad("Unknown op");
  } catch (err) {
    console.error("[swap-admin] POST error:", err);
    return bad(String(err), 500);
  }
}
