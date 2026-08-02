"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Season {
  id: number;
  startDate: string;
  endDate: string;
}

interface Diagnosis {
  season: {
    id: number;
    startDate: string;
    endDate: string;
  };
  candidatePool: {
    total: number;
    byContract: Record<string, number>;
  };
  summary: {
    totalIncomplete: number;
    cAdjacentIncomplete: number;
    totalEmptySlots: number;
    topBlockers: { rule: string; count: number }[];
  };
  games: DiagnosisGame[];
}

interface DiagnosisGame {
  gameNumber: number;
  weekNumber: number;
  date: string;
  dayLabel: string;
  court: number;
  startTime: string;
  currentAssignments: { playerId: number; name: string; skill: string; contract: string; slot: number }[];
  emptySlots: number;
  cCount: number;
  compositionState: string;
  candidates: DiagnosisCandidate[];
}

interface DiagnosisCandidate {
  playerId: number;
  name: string;
  skill: string;
  contract: string;
  cGamesLimit: number | null;
  ruling: string;
  detail?: string;
}

// Tunable rulings — surface these because the admin can act on them
// (loosen a player's C-games cap, or check the Allowed Skill
// Compositions grid on Season Setup). Immutable rulings (blocked-day,
// on vacation, playing same date, do-not-pair) are filtered out
// entirely — showing them was noise since the admin can't do
// anything about them from Season Setup.
const RULE_LABELS: Record<string, string> = {
  eligible: "Eligible (should have filled)",
  seasonACapReached: "Season A+C cap reached",
  compositionBlocked: "Composition blocked (Allowed Compositions grid)",
};
const RULE_COLORS: Record<string, string> = {
  eligible: "bg-green-100 text-green-800 border-green-300",
  seasonACapReached: "bg-red-100 text-red-800 border-red-300",
  compositionBlocked: "bg-purple-100 text-purple-800 border-purple-300",
};
// Rulings we hide because the admin can't act on them.
const IMMUTABLE_RULINGS = new Set(["blockedDay", "onVacation", "playedSameDate", "doNotPair"]);

function formatDate(yyyymmdd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : yyyymmdd;
}

export default function CSlotDiagnosisPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [weekFilter, setWeekFilter] = useState<number | null>(null);
  const [rulingFilter, setRulingFilter] = useState<string>("all");
  const [error, setError] = useState("");

  const load = useCallback(async (sid: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/c-slot-diagnosis?seasonId=${sid}`);
      if (!res.ok) throw new Error("failed");
      setDiagnosis((await res.json()) as Diagnosis);
    } catch {
      setError("Failed to load diagnosis.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch("/api/seasons")
      .then((r) => r.json())
      .then((s: Season[]) => {
        setSeasons(s);
        if (s.length > 0) setSeasonId(s[s.length - 1].id);
      })
      .catch(() => setError("Failed to load seasons."));
  }, []);

  useEffect(() => {
    if (seasonId) load(seasonId);
  }, [seasonId, load]);

  // Filter each game's candidates to just the tunable rulings (drop
  // blocked-day / vacation / same-date / do-not-pair — those are out
  // of the admin's control). Then keep only games whose remaining
  // candidate list satisfies the week + ruling filters.
  const filteredGames = (diagnosis?.games ?? [])
    .map((g) => ({
      ...g,
      immutableCount: g.candidates.filter((c) => IMMUTABLE_RULINGS.has(c.ruling)).length,
      candidates: g.candidates.filter((c) => !IMMUTABLE_RULINGS.has(c.ruling)),
    }))
    .filter((g) => {
      if (weekFilter != null && g.weekNumber !== weekFilter) return false;
      if (rulingFilter !== "all") return g.candidates.some((c) => c.ruling === rulingFilter);
      // Also hide games where every candidate got filtered out — they'd
      // be an empty card with no actionable info.
      return g.candidates.length > 0;
    });

  const weekOptions = diagnosis
    ? [...new Set(diagnosis.games.map((g) => g.weekNumber))].sort((a, b) => a - b)
    : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">C-Slot Diagnosis</h1>
        <div className="text-sm text-muted flex gap-3">
          <Link href="/reports" className="text-primary underline">← All reports</Link>
          <Link href="/season" className="text-primary underline">Season Setup</Link>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        For every incomplete Don&rsquo;s game that has a C player (or could
        still reach a C-inclusive composition allowed by the Season Setup
        grid), this walks every cGamesOk A/B player in the season and
        records which rule blocked them from filling an empty slot. Use it
        to identify whether the current settings are too tight, or whether
        the candidate pool is simply too small.
      </p>

      {seasons.length > 1 && (
        <label className="text-sm mb-4 inline-block">
          Season:{" "}
          <select
            value={seasonId ?? ""}
            onChange={(e) => setSeasonId(Number(e.target.value) || null)}
            className="border border-border rounded px-2 py-1 text-sm ml-1"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.startDate} → {s.endDate}
              </option>
            ))}
          </select>
        </label>
      )}

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {diagnosis && (
        <>
          {/* Season limits panel */}
          <section className="border border-border rounded-lg p-4 bg-white mb-4">
            <h2 className="font-semibold text-sm mb-2">Current C-related settings</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Season C-game cap</dt>
                <dd className="font-mono">Per-player (see &ldquo;Max C-games / season&rdquo; on each player)</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Weekly C-cap</dt>
                <dd className="font-mono">None — cGamesOk is the gate</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">cGamesOk A/B pool</dt>
                <dd className="font-mono">
                  {diagnosis.candidatePool.total}
                  {" "}
                  <span className="text-xs text-gray-500">
                    ({Object.entries(diagnosis.candidatePool.byContract)
                      .filter(([, n]) => n > 0)
                      .map(([k, n]) => `${k}: ${n}`)
                      .join(", ")})
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          {/* Summary */}
          <section className="border border-border rounded-lg p-4 bg-white mb-4">
            <h2 className="font-semibold text-sm mb-2">Summary</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
              <div>
                <dt className="text-xs text-gray-500">Incomplete Don&rsquo;s games (all)</dt>
                <dd className="font-mono text-lg">{diagnosis.summary.totalIncomplete}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">C-adjacent incomplete</dt>
                <dd className="font-mono text-lg">{diagnosis.summary.cAdjacentIncomplete}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Total empty slots</dt>
                <dd className="font-mono text-lg">{diagnosis.summary.totalEmptySlots}</dd>
              </div>
            </dl>
            <div>
              <h3 className="text-xs text-gray-500 mb-1">
                Top blocker rules (aggregated across all games + candidates)
              </h3>
              <div className="flex flex-wrap gap-2">
                {diagnosis.summary.topBlockers
                  .filter((b) => !IMMUTABLE_RULINGS.has(b.rule))
                  .slice(0, 8)
                  .map((b) => (
                    <span
                      key={b.rule}
                      className={`text-xs px-2 py-1 rounded border ${RULE_COLORS[b.rule] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}
                    >
                      {RULE_LABELS[b.rule] ?? b.rule}: <strong>{b.count}</strong>
                    </span>
                  ))}
              </div>
            </div>
          </section>

          {/* Filters */}
          <section className="flex flex-wrap items-center gap-3 mb-4 text-sm">
            <label>
              Week:{" "}
              <select
                value={weekFilter ?? ""}
                onChange={(e) => setWeekFilter(e.target.value ? Number(e.target.value) : null)}
                className="border border-border rounded px-2 py-1 text-sm ml-1"
              >
                <option value="">all</option>
                {weekOptions.map((w) => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </label>
            <label>
              Show games where a candidate was:{" "}
              <select
                value={rulingFilter}
                onChange={(e) => setRulingFilter(e.target.value)}
                className="border border-border rounded px-2 py-1 text-sm ml-1"
              >
                <option value="all">any</option>
                {Object.entries(RULE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </label>
            <span className="text-xs text-gray-500 ml-auto">
              Showing {filteredGames.length} of {diagnosis.games.length}
            </span>
          </section>

          {/* Games */}
          <div className="space-y-3">
            {filteredGames.map((g) => (
              <GameCard
                key={g.gameNumber}
                game={g}
                rulingFilter={rulingFilter}
                immutableCount={g.immutableCount}
              />
            ))}
            {filteredGames.length === 0 && !loading && (
              <p className="text-sm text-muted italic">No games match the filter.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function GameCard({
  game,
  rulingFilter,
  immutableCount,
}: {
  game: DiagnosisGame;
  rulingFilter: string;
  immutableCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shownCandidates = rulingFilter === "all"
    ? game.candidates
    : game.candidates.filter((c) => c.ruling === rulingFilter);

  // Group by ruling for the summary strip
  const byRuling: Record<string, number> = {};
  for (const c of game.candidates) byRuling[c.ruling] = (byRuling[c.ruling] ?? 0) + 1;

  return (
    <div className="border border-border rounded-lg bg-white shadow-sm overflow-hidden">
      <div
        className="p-3 border-b border-border bg-gray-50 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold">
            Wk {game.weekNumber} · Game #{game.gameNumber}
          </span>
          <span className="text-gray-600">
            {game.dayLabel} {formatDate(game.date)} · {game.startTime} · Court {game.court}
          </span>
          <span className="ml-auto text-xs">
            <span className="font-mono">
              {game.currentAssignments.map((a) => a.skill).join("")}
            </span>{" "}
            +{game.emptySlots} empty
          </span>
          <span className="text-xs text-gray-500">
            {expanded ? "▼" : "▶"} {shownCandidates.length} candidate{shownCandidates.length === 1 ? "" : "s"}
            {immutableCount > 0 && (
              <span
                className="ml-1 text-gray-400"
                title="Candidates blocked by rules the admin can't tune (blocked-day, vacation, playing same date, do-not-pair) — hidden here to focus on actionable causes."
              >
                (+{immutableCount} hidden)
              </span>
            )}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 text-xs">
          {game.currentAssignments.map((a) => (
            <span key={a.slot} className="inline-block px-1.5 py-0.5 bg-white border border-border rounded">
              {a.name.split(" ").slice(-1)[0]} ({a.skill})
            </span>
          ))}
          {Array.from({ length: game.emptySlots }).map((_, i) => (
            <span key={`empty-${i}`} className="inline-block px-1.5 py-0.5 bg-amber-50 border border-dashed border-amber-400 rounded text-amber-800">
              empty
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(byRuling)
            .sort((a, b) => b[1] - a[1])
            .map(([r, n]) => (
              <span
                key={r}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${RULE_COLORS[r] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}
              >
                {RULE_LABELS[r] ?? r}: {n}
              </span>
            ))}
        </div>
      </div>
      {expanded && (
        <div className="p-3">
          {shownCandidates.length === 0 ? (
            <p className="text-xs text-muted italic">No candidates match the current filter for this game.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-border">
                  <th className="px-2 py-1">Player</th>
                  <th className="px-2 py-1">Skill</th>
                  <th className="px-2 py-1">Contract</th>
                  <th className="px-2 py-1">Ruling</th>
                  <th className="px-2 py-1">Detail</th>
                </tr>
              </thead>
              <tbody>
                {shownCandidates.map((c) => (
                  <tr key={c.playerId} className="border-b border-border last:border-none">
                    <td className="px-2 py-1">{c.name}</td>
                    <td className="px-2 py-1 font-mono">{c.skill}</td>
                    <td className="px-2 py-1 font-mono">{c.contract}</td>
                    <td className="px-2 py-1">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded border text-[10px] ${RULE_COLORS[c.ruling] ?? "bg-gray-100 text-gray-700 border-gray-300"}`}
                      >
                        {RULE_LABELS[c.ruling] ?? c.ruling}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-gray-600">{c.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
