"use client";

import { useState, useEffect } from "react";

/**
 * Swap Finder — public, read-only, phone-first.
 *
 * Shows who could take a player's game and what they'd offer back. It
 * does NOT perform swaps: those are arranged and recorded off-app, and
 * committed by an admin on the Re-assign screen.
 *
 * Built for a large-touch-target phone screen: one thing per step, no
 * nav, no tables, and a numeric keypad for the game number.
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

function fmtTime(t: string): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr}${ampm}`;
}

interface PlayerLite {
  id: number;
  firstName: string;
  lastName: string;
}

interface GameLite {
  gameNumber: number;
  date: string;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  weekNumber: number;
}

interface Suggestion {
  player: PlayerLite;
  games: GameLite[];
}

export default function SwapFinderPage() {
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [search, setSearch] = useState("");
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [gameNumber, setGameNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    gameA: GameLite;
    playerA: { firstName: string; lastName: string };
    suggestions: Suggestion[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/public/swap-suggest")
      .then((r) => r.json())
      .then((d) => setPlayers(d.players ?? []))
      .catch(() => setError("Could not load the player list."));
  }, []);

  const selected = players.find((p) => p.id === playerId) ?? null;

  const shown = search.trim()
    ? players.filter((p) =>
        `${p.lastName} ${p.firstName}`.toLowerCase().includes(search.trim().toLowerCase())
      )
    : players;

  const suggest = async () => {
    if (!playerId || !gameNumber.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(
        `/api/public/swap-suggest?playerId=${playerId}&gameNumber=${encodeURIComponent(gameNumber.trim())}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const startOver = () => {
    setPlayerId(null);
    setSearch("");
    setGameNumber("");
    setResult(null);
    setError("");
  };

  return (
    //  -m-8 cancels the root layout's p-8: on a 375px phone that padding
    //  would eat a sixth of the screen.
    <div className="-m-8 min-h-screen bg-white text-[#171717]">
    <div className="px-4 py-5 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Swap Finder</h1>
      <p className="text-sm text-gray-500 mb-5">
        Who can take a game, and what they can give back.
      </p>

      {/* Step 1 — who needs to swap out */}
      <div className="mb-5">
        <div className="text-base font-semibold mb-2">1. Who needs a swap?</div>

        {selected ? (
          <button
            onClick={startOver}
            className="w-full flex items-center justify-between border-2 border-blue-600 bg-blue-50 rounded-xl px-4 py-4 text-left"
          >
            <span className="text-lg font-semibold">
              {selected.lastName}, {selected.firstName}
            </span>
            <span className="text-sm text-blue-700 underline">change</span>
          </button>
        ) : (
          <>
            <input
              type="text"
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
                  <button
                    key={p.id}
                    onClick={() => {
                      setPlayerId(p.id);
                      setResult(null);
                      setError("");
                    }}
                    className="w-full text-left px-4 py-4 text-lg border-b border-gray-100 last:border-b-0 active:bg-blue-50"
                  >
                    {p.lastName}, {p.firstName}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Step 2 — which game */}
      {selected && (
        <div className="mb-5">
          <div className="text-base font-semibold mb-2">
            2. Which game number can&rsquo;t they play?
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={gameNumber}
            onChange={(e) => {
              setGameNumber(e.target.value.replace(/[^0-9]/g, ""));
              setResult(null);
              setError("");
            }}
            placeholder="Game number"
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-2xl tracking-wide mb-3"
          />
          <button
            onClick={suggest}
            disabled={!gameNumber.trim() || loading}
            className="w-full bg-blue-600 text-white rounded-xl px-4 py-4 text-xl font-semibold disabled:opacity-40 active:bg-blue-700"
          >
            {loading ? "Looking…" : "Suggest"}
          </button>
        </div>
      )}

      {error && (
        <div className="border-2 border-red-200 bg-red-50 text-red-800 rounded-xl px-4 py-3 text-base mb-5">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div>
          <div className="border-2 border-gray-200 rounded-xl px-4 py-3 mb-4 bg-gray-50">
            <div className="text-sm text-gray-500">Giving up</div>
            <div className="text-lg font-semibold">
              Game #{result.gameA.gameNumber}
            </div>
            <div className="text-base">
              {DAYS[result.gameA.dayOfWeek]} {fmtDate(result.gameA.date)} ·{" "}
              {fmtTime(result.gameA.startTime)} · Court {result.gameA.courtNumber}
            </div>
          </div>

          <div className="text-base font-semibold mb-2">
            {result.suggestions.length === 0
              ? "No one can take this game"
              : `${result.suggestions.length} player${result.suggestions.length !== 1 ? "s" : ""} could take it`}
          </div>

          {result.suggestions.length === 0 ? (
            <p className="text-base text-gray-600 border-2 border-gray-200 rounded-xl px-4 py-4">
              Nobody of the same level is free for this game in the weeks around
              it. The office may still be able to arrange something.
            </p>
          ) : (
            <div className="space-y-3">
              {result.suggestions.map((s) => (
                <div
                  key={s.player.id}
                  className="border-2 border-gray-200 rounded-xl overflow-hidden"
                >
                  <div className="px-4 py-3 bg-gray-50 text-lg font-semibold border-b-2 border-gray-200">
                    {s.player.lastName}, {s.player.firstName}
                  </div>
                  <div className="px-4 py-2">
                    <div className="text-sm text-gray-500 mb-1">
                      can give you one of these:
                    </div>
                    {s.games.map((g) => (
                      <div key={g.gameNumber} className="py-2 border-b border-gray-100 last:border-b-0">
                        <div className="text-lg font-medium">Game #{g.gameNumber}</div>
                        <div className="text-base">
                          {DAYS[g.dayOfWeek]} {fmtDate(g.date)} · {fmtTime(g.startTime)} ·
                          Court {g.courtNumber}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-sm text-gray-500 mt-5">
            These are suggestions only — nothing here changes the schedule.
          </p>
        </div>
      )}
    </div>
    </div>
  );
}
