"use client";

import { useEffect, useState, use } from "react";

/**
 * Delegated swap admin, for a phone. No login: the token in the URL is the
 * credential. First choice is Swap or Give away; the rest of the flow
 * follows from it:
 *
 *   Swap:       who -> which game -> who can swap (and what they give back)
 *   Give away:  who -> which game -> who can take it
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
};
const fmtTime = (t: string) => {
  const [hh, mm] = t.split(":");
  let h = parseInt(hh, 10);
  const ap = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return mm === "00" ? `${h}${ap}` : `${h}:${mm}${ap}`;
};
const tel = (c: string | null) => (c ? c.replace(/\D/g, "") : "");

interface PlayerLite { id: number; firstName: string; lastName: string }
interface GameLite {
  id: number; gameNumber: number; date: string; dayOfWeek: number;
  startTime: string; courtNumber: number; weekNumber?: number; group?: string;
}
interface SwapCand { player: { id: number; name: string; cell: string | null }; game: GameLite; weekDistance: number }
interface HandCand { player: { id: number; name: string; cell: string | null }; isSub: boolean }

type Mode = "swap" | "handoff";

export default function SwapAdminPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const api = `/api/swap-admin/${token}`;

  const [mode, setMode] = useState<Mode | null>(null);
  const [me, setMe] = useState("");
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [search, setSearch] = useState("");
  const [player, setPlayer] = useState<PlayerLite | null>(null);
  const [games, setGames] = useState<GameLite[] | null>(null);
  const [game, setGame] = useState<GameLite | null>(null);
  const [swapC, setSwapC] = useState<SwapCand[] | null>(null);
  const [handC, setHandC] = useState<HandCand[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState("");
  const [done, setDone] = useState<{ text: string; kind: Mode; payload: unknown } | null>(null);
  const [notifyMsg, setNotifyMsg] = useState("");
  const [notified, setNotified] = useState(false);

  const get = async (qs: string) => {
    const res = await fetch(`${api}?${qs}`);
    const data = await res.json();
    if (res.status === 401) setFatal(data.error || "This link is not valid.");
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };
  const post = async (body: unknown) => {
    const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    return { ok: res.ok && data.success !== false && !data.error, data };
  };

  useEffect(() => {
    get("op=players")
      .then((d) => { setMe(d.me); setPlayers(d.players); })
      .catch((e) => setError(String(e.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setMode(null); setPlayer(null); setGames(null); setGame(null);
    setSwapC(null); setHandC(null); setError(""); setDone(null);
    setNotifyMsg(""); setNotified(false); setSearch("");
  };

  const pickPlayer = async (p: PlayerLite) => {
    setPlayer(p); setGames(null); setGame(null); setSwapC(null); setHandC(null); setError("");
    setBusy(true);
    try { setGames((await get(`op=games&playerId=${p.id}`)).games); }
    catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(false); }
  };

  const pickGame = async (g: GameLite) => {
    if (!player || !mode) return;
    setGame(g); setSwapC(null); setHandC(null); setError(""); setBusy(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      if (mode === "swap") setSwapC((await get(`op=swap-candidates&playerId=${player.id}&gameId=${g.id}`)).candidates);
      else setHandC((await get(`op=handoff-candidates&playerId=${player.id}&gameId=${g.id}`)).candidates);
    } catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(false); }
  };

  const doSwap = async (c: SwapCand) => {
    if (!player || !game) return;
    if (!window.confirm(
      `Swap ${player.firstName} ${player.lastName} (${fmtDate(game.date)}) with ${c.player.name} (${fmtDate(c.game.date)})?`
    )) return;
    setBusy(true); setError("");
    const payload = { gameAId: game.id, playerAId: player.id, gameBId: c.game.id, playerBId: c.player.id };
    const { ok, data } = await post({ op: "swap", ...payload });
    setBusy(false);
    if (!ok) { setError(data.error || "Swap failed."); return; }
    setDone({
      kind: "swap", payload,
      text: `Swapped: ${player.firstName} ${player.lastName} now plays ${DAYS[c.game.dayOfWeek]} ${fmtDate(c.game.date)}; ${c.player.name} plays ${DAYS[game.dayOfWeek]} ${fmtDate(game.date)}.`,
    });
  };

  const doHandoff = async (c: HandCand) => {
    if (!player || !game) return;
    if (!window.confirm(
      `Give ${fmtDate(game.date)} from ${player.firstName} ${player.lastName} to ${c.player.name}${c.isSub ? " (a sub)" : ""}? Nothing comes back.`
    )) return;
    setBusy(true); setError("");
    const payload = { gameId: game.id, fromPlayerId: player.id, toPlayerId: c.player.id };
    const { ok, data } = await post({ op: "handoff", ...payload });
    setBusy(false);
    if (!ok) { setError(data.error || "Hand-off failed."); return; }
    setDone({
      kind: "handoff", payload,
      text: `${c.player.name} now plays ${DAYS[game.dayOfWeek]} ${fmtDate(game.date)}; ${player.firstName} ${player.lastName} is out of it.`,
    });
  };

  const notify = async () => {
    if (!done) return;
    setBusy(true); setNotifyMsg("");
    const { ok, data } = await post({ op: "notify", kind: done.kind, payload: done.payload });
    setBusy(false);
    if (!ok || !data.results) { setNotifyMsg(data.error || "Could not send the notices."); return; }
    const results = data.results as { name: string; sent: boolean; error?: string }[];
    setNotifyMsg(results.map((r) => (r.sent ? `✓ Emailed ${r.name}` : `✗ ${r.name}: ${r.error ?? "not sent"}`)).join("  "));
    if (results.every((r) => r.sent)) setNotified(true);
  };

  if (fatal) {
    return <main className="p-6 max-w-md mx-auto text-center text-red-700">{fatal}</main>;
  }

  const shown = search.trim()
    ? players.filter((p) => `${p.lastName} ${p.firstName}`.toLowerCase().includes(search.trim().toLowerCase()))
    : players;
  const btn = "w-full rounded-lg px-4 py-3 text-base font-medium text-white bg-blue-600 active:bg-blue-700 disabled:opacity-50";

  return (
    <main className="max-w-md mx-auto p-4 pb-16 text-[#171717]">
      <div className="flex items-baseline justify-between mb-3">
        <h1 className="text-xl font-semibold">Swap Admin</h1>
        {mode && <button onClick={reset} className="text-sm text-blue-700 underline">Start over</button>}
      </div>
      {me && <p className="text-xs text-gray-500 mb-3">Signed in by link as {me}.</p>}
      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {/* Done */}
      {done && (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          <p>✓ {done.text}</p>
          {!notified && (
            <button onClick={notify} disabled={busy} className={`${btn} mt-3`}>
              {busy ? "Sending..." : "Notify players"}
            </button>
          )}
          {notifyMsg && <p className="mt-2 text-xs">{notifyMsg}</p>}
          <button onClick={reset} className="mt-3 text-blue-700 underline">Do another</button>
        </div>
      )}

      {/* Step 0: choose */}
      {!done && !mode && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">What do you want to do?</p>
          <button className={btn} onClick={() => setMode("swap")}>
            Swap — trade games with another player
          </button>
          <button className={btn} onClick={() => setMode("handoff")}>
            Give away — hand a game to a player or sub
          </button>
        </div>
      )}

      {/* Step 1: who */}
      {!done && mode && !player && (
        <div>
          <p className="text-sm font-medium mb-2">
            {mode === "swap" ? "Swap" : "Give away"} — who can&apos;t play?
          </p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base mb-2"
          />
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
            {shown.map((p) => (
              <button key={p.id} onClick={() => pickPlayer(p)} className="block w-full text-left px-3 py-3 active:bg-gray-100">
                {p.lastName}, {p.firstName}
              </button>
            ))}
            {shown.length === 0 && <p className="p-3 text-sm text-gray-500">No players match.</p>}
          </div>
        </div>
      )}

      {/* Step 2: which game */}
      {!done && mode && player && !game && (
        <div>
          <p className="text-sm font-medium mb-1">
            {player.firstName} {player.lastName} — which game?
          </p>
          <button onClick={() => { setPlayer(null); setGames(null); }} className="text-xs text-blue-700 underline mb-2">
            Change player
          </button>
          {games === null ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : games.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming games.</p>
          ) : (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
              {games.map((g) => (
                <button key={g.id} onClick={() => pickGame(g)} className="block w-full text-left px-3 py-3 active:bg-gray-100">
                  <span className="font-medium">{DAYS[g.dayOfWeek]} {fmtDate(g.date)}</span>{" "}
                  · {fmtTime(g.startTime)} · Ct {g.courtNumber}
                  {g.group === "solo" && <span className="ml-2 text-xs text-gray-500">Solo</span>}
                  <span className="text-xs text-gray-500"> · #{g.gameNumber}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: results */}
      {!done && mode && player && game && (
        <div>
          <p className="text-sm">
            <strong>{player.firstName} {player.lastName}</strong> can&apos;t play{" "}
            <strong>{DAYS[game.dayOfWeek]} {fmtDate(game.date)}</strong> · {fmtTime(game.startTime)} · Ct {game.courtNumber}
          </p>
          <button onClick={() => { setGame(null); setSwapC(null); setHandC(null); }} className="text-xs text-blue-700 underline mb-3">
            Change game
          </button>
          {busy && !swapC && !handC && <p className="text-sm text-gray-500">Looking...</p>}

          {mode === "swap" && swapC && (
            swapC.length === 0 ? (
              <p className="text-sm text-gray-500">Nobody of the same level can swap for this game in the weeks around it.</p>
            ) : (
              <div className="space-y-2">
                {swapC.map((c) => (
                  <div key={`${c.player.id}-${c.game.id}`} className="border border-gray-200 rounded-lg p-3">
                    <div className="font-medium">{c.player.name}</div>
                    {c.player.cell && (
                      <a href={`tel:${tel(c.player.cell)}`} className="text-sm text-blue-700">{c.player.cell}</a>
                    )}
                    <div className="text-sm mt-1">
                      Would give you: {DAYS[c.game.dayOfWeek]} {fmtDate(c.game.date)} · {fmtTime(c.game.startTime)} · Ct {c.game.courtNumber}
                      <span className="text-xs text-gray-500"> ({c.weekDistance === 0 ? "same week" : `±${c.weekDistance} wk`})</span>
                    </div>
                    <button onClick={() => doSwap(c)} disabled={busy} className={`${btn} mt-2 py-2`}>Swap</button>
                  </div>
                ))}
              </div>
            )
          )}

          {mode === "handoff" && handC && (
            handC.length === 0 ? (
              <p className="text-sm text-gray-500">Nobody of the same level is free for this game.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Contract players first, then subs (a paid substitution).</p>
                {handC.map((c) => (
                  <div key={c.player.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="font-medium">
                      {c.player.name}
                      {c.isSub && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">Sub</span>}
                    </div>
                    {c.player.cell && (
                      <a href={`tel:${tel(c.player.cell)}`} className="text-sm text-blue-700">{c.player.cell}</a>
                    )}
                    <button onClick={() => doHandoff(c)} disabled={busy} className={`${btn} mt-2 py-2`}>Give game</button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </main>
  );
}
