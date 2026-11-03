"use client";

import { useEffect, useState, use } from "react";
import { APP_VERSION } from "@/lib/version";
import { formatPhone } from "@/lib/formatPhone";
import { matchGameDate } from "@/lib/matchGameDate";

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
const barCls = "w-full flex items-center justify-between border-2 border-blue-600 bg-blue-50 rounded-xl px-4 py-4 text-left";

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

  const [me, setMe] = useState("");
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [search, setSearch] = useState("");
  const [player, setPlayer] = useState<PlayerLite | null>(null);
  const [games, setGames] = useState<GameLite[] | null>(null);
  const [game, setGame] = useState<GameLite | null>(null);
  const [swapC, setSwapC] = useState<SwapCand[] | null>(null);
  const [handC, setHandC] = useState<HandCand[] | null>(null);
  type Why = { name: string; reason: string }[];
  const [swapWhy, setSwapWhy] = useState<Why>([]);
  const [handWhy, setHandWhy] = useState<Why>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState("");
  const [done, setDone] = useState<{ text: string; kind: Mode; payload: unknown } | null>(null);
  const [notifyMsg, setNotifyMsg] = useState("");
  const [notified, setNotified] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [numInput, setNumInput] = useState("");

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
    setPlayer(null); setGames(null); setGame(null);
    setSwapC(null); setHandC(null); setError(""); setDone(null);
    setNotifyMsg(""); setNotified(false); setSearch("");
    setDateInput(""); setNumInput("");
  };

  const pickPlayer = async (p: PlayerLite) => {
    setPlayer(p); setGames(null); setGame(null); setSwapC(null); setHandC(null); setError("");
    setBusy(true);
    try { setGames((await get(`op=games&playerId=${p.id}`)).games); }
    catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(false); }
  };

  //  Both answers at once: who could swap for the game, and who could
  //  simply take it. The choice is made at the button.
  const pickGame = async (g: GameLite) => {
    if (!player) return;
    setGame(g); setSwapC(null); setHandC(null); setSwapWhy([]); setHandWhy([]); setError(""); setBusy(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const [sw, hd] = await Promise.all([
        get(`op=swap-candidates&playerId=${player.id}&gameId=${g.id}`),
        get(`op=handoff-candidates&playerId=${player.id}&gameId=${g.id}`),
      ]);
      setSwapC(sw.candidates); setSwapWhy(sw.reasons ?? []);
      setHandC(hd.candidates); setHandWhy(hd.reasons ?? []);
    } catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(false); }
  };

  // Quick entry: a date or game number typed directly picks that game.
  const jump = (found: GameLite | undefined, msg: string) => {
    if (found) { setError(""); pickGame(found); } else setError(msg);
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
    return (
      <main className="p-6 max-w-md mx-auto text-center text-red-700">
        {fatal}
        <p className="text-xs text-gray-400 mt-8">Swap Admin v{APP_VERSION}</p>
      </main>
    );
  }

  const shown = search.trim()
    ? players.filter((p) => `${p.lastName} ${p.firstName}`.toLowerCase().includes(search.trim().toLowerCase()))
    : players;
  const btn = "rounded-xl px-5 py-3 text-base font-semibold text-white bg-blue-600 active:bg-blue-700 disabled:opacity-50";

  // One card per partner, as on the public Swap Finder.
  const swapGroups: { player: SwapCand["player"]; cands: SwapCand[] }[] = [];
  for (const c of swapC ?? []) {
    let g = swapGroups.find((x) => x.player.id === c.player.id);
    if (!g) { g = { player: c.player, cands: [] }; swapGroups.push(g); }
    g.cands.push(c);
  }

  const whyNot = (reasons: Why) => reasons.length > 0 && (
    <div className="mt-3 text-sm text-gray-600">
      <p className="font-medium mb-1">Why no one fits ({player?.firstName}&apos;s level):</p>
      <ul className="list-disc pl-5 space-y-0.5">
        {reasons.map((r) => (
          <li key={r.name}><strong>{r.name}</strong> — {r.reason}</li>
        ))}
      </ul>
    </div>
  );

  const phone = (cell: string | null) =>
    cell ? (
      <a href={`tel:${tel(cell)}`} className="text-lg font-bold text-blue-700 underline">{formatPhone(cell)}</a>
    ) : (
      <span className="text-base text-gray-500">no cell number</span>
    );

  return (
    <div className="-m-8 min-h-screen bg-white text-[#171717]">
    <div className="px-4 py-5 max-w-xl mx-auto pb-16">
      <h1 className="text-2xl font-bold mb-1">Swap Admin</h1>
      <p className="text-sm text-gray-500 mb-5">
        Swap games, or give one away.{me && <> Signed in by link as {me}.</>}
      </p>
      {error && <div className="border-2 border-red-200 bg-red-50 text-red-800 rounded-xl px-4 py-3 text-base mb-5">{error}</div>}

      {/* Done */}
      {done && (
        <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 text-base text-green-900">
          <p>✓ {done.text}</p>
          {!notified && (
            <button onClick={notify} disabled={busy} className={`${btn} mt-3`}>
              {busy ? "Sending..." : "Notify players"}
            </button>
          )}
          {notifyMsg && <p className="mt-2 text-sm">{notifyMsg}</p>}
          <button onClick={reset} className="mt-3 block text-blue-700 underline">Do another</button>
        </div>
      )}

      {/* Step 1 — who */}
      {!done && (
        <div className="mb-5">
          <div className="text-base font-semibold mb-2">1. Who can&apos;t play?</div>
          {player ? (
            <button onClick={() => { setPlayer(null); setGames(null); setGame(null); setSwapC(null); setHandC(null); setError(""); }} className={barCls}>
              <span className="text-lg font-semibold">{player.lastName}, {player.firstName}</span>
              <span className="text-sm text-blue-700 underline">change</span>
            </button>
          ) : (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type a name…"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg mb-2"
              />
              <div className="border-2 border-gray-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {players.length === 0 && !error ? (
                  <p className="px-4 py-3 text-gray-500">Loading players…</p>
                ) : shown.length === 0 ? (
                  <p className="px-4 py-3 text-gray-500">No one matches that.</p>
                ) : (
                  shown.map((p) => (
                    <button key={p.id} onClick={() => pickPlayer(p)} className="w-full text-left px-4 py-4 text-lg border-b border-gray-100 last:border-b-0 active:bg-blue-50">
                      {p.lastName}, {p.firstName}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2 — which date */}
      {!done && player && (
        <div className="mb-5">
          <div className="text-base font-semibold mb-2">2. Which date can&apos;t they play?</div>
          {game ? (
            <button onClick={() => { setGame(null); setSwapC(null); setHandC(null); setError(""); }} className={barCls}>
              <span>
                <span className="block text-lg font-semibold">{DAYS[game.dayOfWeek]} {fmtDate(game.date)}</span>
                <span className="block text-base text-gray-600">
                  {fmtTime(game.startTime)} · Court {game.courtNumber} · {game.group === "solo" ? "SOLO" : "Don's"} · Game #{game.gameNumber}
                </span>
              </span>
              <span className="text-sm text-blue-700 underline shrink-0 ml-3">change</span>
            </button>
          ) : games === null ? (
            <p className="text-gray-500 px-1 py-2">Loading games…</p>
          ) : null}
          {!game && games !== null && (
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Enter the date</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={dateInput}
                  onChange={(e) => { setDateInput(e.target.value); setNumInput(""); setError(""); }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    e.currentTarget.blur();
                  }}
                  onBlur={() => {
                    if (!dateInput.trim()) return;
                    const r = matchGameDate(dateInput, games);
                    jump(r.game ?? undefined, r.error ? `${player.firstName}: ${r.error}` : "");
                  }}
                  placeholder="month/day, e.g. 3/10"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  className="border-2 border-gray-300 rounded-xl px-3 py-2 text-base w-44"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">or Game #</label>
                <input
                  type="number"
                  value={numInput}
                  onChange={(e) => { setNumInput(e.target.value); setDateInput(""); }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const n = parseInt(numInput.trim(), 10);
                    jump(games.find((g) => g.gameNumber === n), `${player.firstName} is not in game #${numInput}.`);
                  }}
                  placeholder="e.g. 412"
                  className="border-2 border-gray-300 rounded-xl px-3 py-2 text-base w-28"
                />
              </div>
            </div>
          )}
          {!game && games !== null && (games.length === 0 ? (
            <p className="text-base text-gray-600 border-2 border-gray-200 rounded-xl px-4 py-4">
              {player.firstName} has no games left.
            </p>
          ) : (
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              {games.map((g) => (
                <button key={g.id} onClick={() => pickGame(g)} className="w-full text-left px-4 py-4 border-b border-gray-100 last:border-b-0 active:bg-blue-50">
                  <div className="text-lg font-semibold">{DAYS[g.dayOfWeek]} {fmtDate(g.date)}</div>
                  <div className="text-base text-gray-600">
                    {fmtTime(g.startTime)} · Court {g.courtNumber} · {g.group === "solo" ? "SOLO" : "Don's"} · Game #{g.gameNumber}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {!done && busy && game && !swapC && (
        <div className="border-2 border-blue-200 bg-blue-50 text-blue-800 rounded-xl px-4 py-4 text-lg mb-5">
          Looking for swaps…
        </div>
      )}

      {/* Results — swap */}
      {!done && player && game && swapC && (
        <div>
          <div className="text-base font-semibold mb-2">
            {swapGroups.length === 0
              ? "Swap — no one can trade for this game"
              : `Swap — ${swapGroups.length} player${swapGroups.length !== 1 ? "s" : ""} could trade for it`}
          </div>
          {swapGroups.length === 0 ? (
            <div className="text-base text-gray-600 border-2 border-gray-200 rounded-xl px-4 py-4">
              Nobody of the same level can swap for this game in the weeks around it.
              {whyNot(swapWhy)}
            </div>
          ) : (
            <div className="space-y-3">
              {swapGroups.map((grp) => (
                <div key={grp.player.id} className="border-2 border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b-2 border-gray-200">
                    <div className="text-lg font-semibold">{grp.player.name}</div>
                    {phone(grp.player.cell)}
                  </div>
                  <div className="px-4 py-2">
                    <div className="text-sm text-gray-500 mb-1">can give you one of these:</div>
                    {grp.cands.map((c) => (
                      <div key={c.game.id} className="py-2 border-b border-gray-100 last:border-b-0 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-medium">Game #{c.game.gameNumber}</div>
                          <div className="text-base">
                            {DAYS[c.game.dayOfWeek]} {fmtDate(c.game.date)} · {fmtTime(c.game.startTime)} · Court {c.game.courtNumber}
                          </div>
                        </div>
                        <button onClick={() => doSwap(c)} disabled={busy} className={`${btn} shrink-0`}>Swap</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results — give away */}
      {!done && player && game && handC && (
        <div className="mt-6">
          <div className="text-base font-semibold mb-2">
            {handC.length === 0 ? "Or give it away — no one can take it" : `Or give it away — ${handC.length} player${handC.length !== 1 ? "s" : ""} could take it`}
          </div>
          {handC.length === 0 ? (
            <div className="text-base text-gray-600 border-2 border-gray-200 rounded-xl px-4 py-4">
              Nobody of the same level is free for this game.
              {whyNot(handWhy)}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Contract players first, then subs (a paid substitution).</p>
              {handC.map((c) => (
                <div key={c.player.id} className="border-2 border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">
                        {c.player.name}
                        {c.isSub && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">Sub</span>}
                      </div>
                      {phone(c.player.cell)}
                    </div>
                    <button onClick={() => doHandoff(c)} disabled={busy} className={`${btn} shrink-0`}>Give game</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-8 text-center">Swap Admin v{APP_VERSION}</p>
    </div>
    </div>
  );
}
