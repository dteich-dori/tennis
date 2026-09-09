"use client";

import { useState, useEffect } from "react";
import { formatPhone } from "@/lib/formatPhone";

/**
 * Swap Finder — public, read-only, phone-first.
 *
 * Shows who could take a player's game and what they'd offer back. It
 * does NOT perform swaps: those are arranged and recorded off-app, and
 * committed by an admin on the Re-assign screen.
 *
 * Built for a large-touch-target phone screen: one thing per step, no
 * nav, no tables, and nothing to type beyond a name — the player's own
 * games are listed by date to tap, because reading a game number off a
 * printed schedule is the step this page exists to remove.
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
  /** Only sent for suggested partners — the picker list has no numbers. */
  cellNumber?: string | null;
}

interface GameLite {
  gameNumber: number;
  date: string;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  weekNumber: number;
  group?: string;
}

interface Suggestion {
  player: PlayerLite;
  games: GameLite[];
}

export default function SwapFinderPage() {
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [search, setSearch] = useState("");
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [myGames, setMyGames] = useState<GameLite[] | null>(null);
  const [loadingGames, setLoadingGames] = useState(false);
  const [chosen, setChosen] = useState<GameLite | null>(null);
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

  //  A player's games are fetched as soon as they are chosen, so step 2
  //  is a list of dates rather than a number to look up and type.
  useEffect(() => {
    if (!playerId) {
      setMyGames(null);
      return;
    }
    let stale = false;
    setLoadingGames(true);
    fetch(`/api/public/swap-suggest?playerId=${playerId}`)
      .then((r) => r.json())
      .then((d) => {
        if (stale) return;
        setMyGames(d.games ?? []);
      })
      .catch(() => {
        if (!stale) setError("Could not load this player's games.");
      })
      .finally(() => {
        if (!stale) setLoadingGames(false);
      });
    return () => {
      stale = true;
    };
  }, [playerId]);

  const selected = players.find((p) => p.id === playerId) ?? null;

  const shown = search.trim()
    ? players.filter((p) =>
        `${p.lastName} ${p.firstName}`.toLowerCase().includes(search.trim().toLowerCase())
      )
    : players;

  const suggest = async (g: GameLite) => {
    if (!playerId) return;
    //  Collapsing the date list to a one-line summary is what makes the
    //  answer visible: a full-season player has ~100 games, so results
    //  rendered underneath the list would be off the bottom of a phone.
    setChosen(g);
    setLoading(true);
    setError("");
    setResult(null);
    //  The list shrinks under the finger that tapped it; put the top of
    //  the page back in view so the answer is where the eye already is.
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const res = await fetch(
        `/api/public/swap-suggest?playerId=${playerId}&gameNumber=${g.gameNumber}`
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
    setMyGames(null);
    setChosen(null);
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
                      setChosen(null);
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

      {/* Step 2 — which game. Tapping a date runs the search and folds
          the list away, so the answer replaces the question. */}
      {selected && (
        <div className="mb-5">
          <div className="text-base font-semibold mb-2">
            2. Which date can&rsquo;t they play?
          </div>

          {chosen ? (
            <button
              onClick={() => {
                setChosen(null);
                setResult(null);
                setError("");
              }}
              className="w-full flex items-center justify-between border-2 border-blue-600 bg-blue-50 rounded-xl px-4 py-4 text-left"
            >
              <span>
                <span className="block text-lg font-semibold">
                  {DAYS[chosen.dayOfWeek]} {fmtDate(chosen.date)}
                </span>
                <span className="block text-base text-gray-600">
                  {fmtTime(chosen.startTime)} · Court {chosen.courtNumber} ·{" "}
                  {chosen.group === "solo" ? "SOLO" : "Don's"} · Game #
                  {chosen.gameNumber}
                </span>
              </span>
              <span className="text-sm text-blue-700 underline shrink-0 ml-3">
                change
              </span>
            </button>
          ) : loadingGames ? (
            <p className="text-gray-500 px-1 py-2">Loading games…</p>
          ) : !myGames || myGames.length === 0 ? (
            <p className="text-base text-gray-600 border-2 border-gray-200 rounded-xl px-4 py-4">
              {selected.firstName} has no games left to swap.
            </p>
          ) : (
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              {myGames.map((g) => (
                <button
                  key={g.gameNumber}
                  onClick={() => suggest(g)}
                  className="w-full text-left px-4 py-4 border-b border-gray-100 last:border-b-0 active:bg-blue-50"
                >
                  <div className="text-lg font-semibold">
                    {DAYS[g.dayOfWeek]} {fmtDate(g.date)}
                  </div>
                  <div className="text-base text-gray-600">
                    {fmtTime(g.startTime)} · Court {g.courtNumber} ·{" "}
                    {g.group === "solo" ? "SOLO" : "Don's"} · Game #{g.gameNumber}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="border-2 border-blue-200 bg-blue-50 text-blue-800 rounded-xl px-4 py-4 text-lg mb-5">
          Looking for swaps…
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
                  <div className="px-4 py-3 bg-gray-50 border-b-2 border-gray-200">
                    <div className="text-lg font-semibold">
                      {s.player.lastName}, {s.player.firstName}
                    </div>
                    {/*  Tapping the number dials it — the whole point of
                        this page is to end in a phone call. */}
                    {s.player.cellNumber ? (
                      <a
                        href={`tel:${s.player.cellNumber.replace(/\D/g, "")}`}
                        className="text-lg font-bold text-blue-700 underline"
                      >
                        {formatPhone(s.player.cellNumber)}
                      </a>
                    ) : (
                      <span className="text-base text-gray-500">no cell number</span>
                    )}
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
