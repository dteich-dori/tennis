"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { findSwapSuggestions, findHandoffCandidates, explainNoMatch, whyCannotPlay } from "@/lib/swapSuggestions";
import { matchGameDate } from "@/lib/matchGameDate";
import { formatPhone } from "@/lib/formatPhone";

interface Season {
  id: number;
  startDate: string;
  endDate: string;
  totalWeeks: number;
}

interface Vacation {
  startDate: string;
  endDate: string;
}

interface Player {
  id: number;
  firstName: string;
  lastName: string;
  isActive: boolean;
  skillLevel: string;
  contractedFrequency: string;
  soloGames: number | null;
  noEarlyGames?: boolean;
  //  Shown beside a suggested swap partner so they can be rung straight
  //  from this screen. /api/players already returns it.
  cellNumber: string | null;
  blockedDays: number[];
  vacations: Vacation[];
  doNotPair: number[];
}

interface Assignment {
  playerId: number;
  slotPosition: number;
  isPrefill: boolean;
}

interface Game {
  id: number;
  gameNumber: number;
  weekNumber: number;
  date: string;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  group: string;
  status: string;
  assignments: Assignment[];
}

interface SlotDisplay {
  playerId: number | null;
  label: string; // "Lastname, F." or "— Open —"
  isNew: boolean; // true if added by the re-assignment
  isRemoved: boolean; // true if removed by the re-assignment (shown only in "before" view)
}

interface ChangeRecord {
  game: Game;
  removed: Array<{ playerId: number; playerName: string; reason: string }>;
  before: SlotDisplay[]; // 4 slots, indices 0..3 representing slotPosition 1..4
  after: SlotDisplay[];
}

interface ConflictRow {
  gameId: number;
  playerId: number | null; // null for Incomplete rows
  gameNumber: number;
  weekNumber: number;
  date: string;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  group: string; // "dons" | "solo"
  playerName: string;
  conflict: string;
  severity: "error" | "warning";
}

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  return mStr === "00" ? `${h}${ampm}` : `${h}:${mStr}${ampm}`;
}

function playerLabel(p: Player): string {
  return `${p.lastName}, ${p.firstName.charAt(0)}.`;
}

export default function ReAssignPage() {
  const router = useRouter();
  // Data
  const [season, setSeason] = useState<Season | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingBase, setLoadingBase] = useState(true);
  const [baseError, setBaseError] = useState("");

  // Controls
  const [effectiveDate, setEffectiveDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [weekStart, setWeekStart] = useState<number>(1);
  const [weekEnd, setWeekEnd] = useState<number>(36);
  // Defaults checked (v1.156) — match Season Setup behaviour
  const [assignExtra, setAssignExtra] = useState(true);
  const [assignSubs, setAssignSubs] = useState(false);

  // Scan results
  const [conflicts, setConflicts] = useState<ConflictRow[] | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());

  // Apply results
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string>("");
  const [applyError, setApplyError] = useState<string>("");
  const [changes, setChanges] = useState<ChangeRecord[] | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<"conflicts" | "swap">("conflicts");

  // --- Swap tab state ---
  const [swapPlayerId, setSwapPlayerId] = useState<number | null>(null);
  const [swapPlayerSearch, setSwapPlayerSearch] = useState("");
  const [swapGameAId, setSwapGameAId] = useState<number | null>(null);
  //  Search window either side of the game being given up. These used to
  //  be 1 ahead / 0 back, which is far too tight: measured over the live
  //  season, Suggest came back empty 21% of the time for Solo games (only
  //  11 solo players, all one skill level) against 3% at the wider span.
  //  The public /swap-finder always used 4/6 and found partners for the
  //  same games, so the two screens disagreed on identical input.
  const [swapWeeksAhead, setSwapWeeksAhead] = useState(6);
  const [swapWeeksBack, setSwapWeeksBack] = useState(4);
  const [swapping, setSwapping] = useState(false);
  const [swapBanner, setSwapBanner] = useState<string>("");
  const [swapError, setSwapError] = useState<string>("");

  // --- Load season + games + players ---
  const loadBase = useCallback(async () => {
    setLoadingBase(true);
    setBaseError("");
    try {
      const seasonsRes = await fetch("/api/seasons");
      if (!seasonsRes.ok) throw new Error("Failed to load season");
      const allSeasons = (await seasonsRes.json()) as Season[];
      if (allSeasons.length === 0) throw new Error("No seasons found");
      const current = allSeasons[allSeasons.length - 1];
      setSeason(current);

      // Compute default week range once season is known: current week → last week
      const start = new Date(current.startDate + "T00:00:00");
      const today = new Date();
      const diffDays = Math.floor(
        (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );
      const curWk = Math.max(1, Math.min(Math.floor(diffDays / 7) + 1, current.totalWeeks));
      setWeekStart(curWk);
      setWeekEnd(current.totalWeeks);

      const [gamesRes, playersRes] = await Promise.all([
        fetch(`/api/games?seasonId=${current.id}`),
        fetch(`/api/players?seasonId=${current.id}`),
      ]);
      if (!gamesRes.ok) throw new Error("Failed to load games");
      if (!playersRes.ok) throw new Error("Failed to load players");
      setGames((await gamesRes.json()) as Game[]);
      setPlayers((await playersRes.json()) as Player[]);
    } catch (err) {
      setBaseError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingBase(false);
    }
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  // --- Scan for conflicts (local computation) ---
  const runScan = () => {
    setApplyResult("");
    setApplyError("");
    if (!season) return;

    const playerById = new Map(players.map((p) => [p.id, p]));
    const rows: ConflictRow[] = [];

    const relevantGames = games.filter(
      (g) =>
        g.status === "normal" &&
        g.weekNumber >= weekStart &&
        g.weekNumber <= weekEnd &&
        g.date >= effectiveDate
    );

    for (const g of relevantGames) {
      const assignments = g.assignments ?? [];

      // Per-player conflicts
      for (const a of assignments) {
        const p = playerById.get(a.playerId);
        if (!p) continue;

        // 1. Inactive
        if (!p.isActive) {
          rows.push({
            gameId: g.id,
            playerId: p.id,
            gameNumber: g.gameNumber,
            weekNumber: g.weekNumber,
            date: g.date,
            dayOfWeek: g.dayOfWeek,
            startTime: g.startTime,
            courtNumber: g.courtNumber,
            group: g.group,
            playerName: playerLabel(p),
            conflict: "Inactive player",
            severity: "error",
          });
        }

        // 2. Vacation
        for (const v of p.vacations ?? []) {
          if (g.date >= v.startDate && g.date <= v.endDate) {
            rows.push({
              gameId: g.id,
              playerId: p.id,
              gameNumber: g.gameNumber,
              weekNumber: g.weekNumber,
              date: g.date,
              dayOfWeek: g.dayOfWeek,
              startTime: g.startTime,
              courtNumber: g.courtNumber,
              group: g.group,
              playerName: playerLabel(p),
              conflict: `Vacation ${v.startDate}—${v.endDate}`,
              severity: "error",
            });
            break;
          }
        }

        // 3. Blocked day
        if ((p.blockedDays ?? []).includes(g.dayOfWeek)) {
          rows.push({
            gameId: g.id,
            playerId: p.id,
            gameNumber: g.gameNumber,
            weekNumber: g.weekNumber,
            date: g.date,
            dayOfWeek: g.dayOfWeek,
            startTime: g.startTime,
            courtNumber: g.courtNumber,
            group: g.group,
            playerName: playerLabel(p),
            conflict: `Blocked on ${DAYS_SHORT[g.dayOfWeek]}`,
            severity: "error",
          });
        }

        // 4. Do-not-pair — check against other players in this game
        const otherAssigned = assignments.filter((o) => o.playerId !== p.id);
        for (const other of otherAssigned) {
          const otherP = playerById.get(other.playerId);
          if (!otherP) continue;
          if ((p.doNotPair ?? []).includes(otherP.id)) {
            rows.push({
              gameId: g.id,
              playerId: p.id,
              gameNumber: g.gameNumber,
              weekNumber: g.weekNumber,
              date: g.date,
              dayOfWeek: g.dayOfWeek,
              startTime: g.startTime,
              courtNumber: g.courtNumber,
              group: g.group,
              playerName: playerLabel(p),
              conflict: `Do-not-pair with ${playerLabel(otherP)}`,
              severity: "error",
            });
            break;
          }
        }
      }

      // 5. Incomplete game (< 4)
      if (assignments.length < 4) {
        rows.push({
          gameId: g.id,
          playerId: null,
          gameNumber: g.gameNumber,
          weekNumber: g.weekNumber,
          date: g.date,
          dayOfWeek: g.dayOfWeek,
          startTime: g.startTime,
          courtNumber: g.courtNumber,
          group: g.group,
          playerName: "—",
          conflict: `Incomplete (${assignments.length}/4)`,
          severity: "warning",
        });
      }
    }

    // Sort by date, then gameNumber
    rows.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.gameNumber !== b.gameNumber) return a.gameNumber - b.gameNumber;
      return a.playerName.localeCompare(b.playerName);
    });

    setConflicts(rows);
    // All checked by default
    setCheckedKeys(new Set(rows.map((r) => rowKey(r))));
  };

  const rowKey = (r: ConflictRow) => `${r.gameId}:${r.playerId ?? "none"}:${r.conflict}`;

  const toggleRow = (r: ConflictRow) => {
    const k = rowKey(r);
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleAll = () => {
    if (!conflicts) return;
    if (checkedKeys.size === conflicts.length) {
      setCheckedKeys(new Set());
    } else {
      setCheckedKeys(new Set(conflicts.map((r) => rowKey(r))));
    }
  };

  // --- Apply re-assignment ---
  // `targetGroup` is "dons" or "solo" — only selected rows of that group are processed.
  // Don's uses auto-refill; Solo only clears slots (Solo share-logic needs manual pick).
  const runApply = async (targetGroup: "dons" | "solo") => {
    if (!season || !conflicts) return;
    const selected = conflicts.filter(
      (r) => checkedKeys.has(rowKey(r)) && r.group === targetGroup
    );
    if (selected.length === 0) {
      setApplyError(
        `No ${targetGroup === "dons" ? "Don's" : "Solo"} rows selected.`
      );
      return;
    }
    const groupLabel = targetGroup === "dons" ? "Don's" : "Solo";
    const refillNote =
      targetGroup === "dons"
        ? "Affected slots will be cleared and auto-filled."
        : "Affected Solo slots will be cleared only. You'll need to fill them manually on the Schedule page (Solo uses share-based assignment that's not auto-recoverable per-slot).";
    if (
      !window.confirm(
        `Re-assign ${selected.length} ${groupLabel} row${selected.length !== 1 ? "s" : ""}?\n\n` +
          refillNote +
          "\n\nThis cannot be undone without a backup."
      )
    ) {
      return;
    }
    const runAutoAssign = targetGroup === "dons";
    setApplying(true);
    setApplyResult("");
    setApplyError("");
    setChanges(null);
    try {
      // De-dup targets by gameId+playerId (one player can appear for multiple rules on same game)
      const seen = new Set<string>();
      const targets = selected
        .map((r) => ({ gameId: r.gameId, playerId: r.playerId }))
        .filter((t) => {
          const k = `${t.gameId}:${t.playerId ?? "none"}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });

      // --- SNAPSHOT: record "before" state for each affected game ---
      const affectedGameIds = [...new Set(targets.map((t) => t.gameId))];
      const gameById = new Map(games.map((g) => [g.id, g]));
      const playerById = new Map(players.map((p) => [p.id, p]));
      const beforeSnapshot = new Map<number, Game>();
      for (const gid of affectedGameIds) {
        const g = gameById.get(gid);
        if (g) {
          // Deep-ish clone of assignments so later state updates don't mutate it
          beforeSnapshot.set(gid, {
            ...g,
            assignments: [...(g.assignments ?? [])],
          });
        }
      }

      // Build removal info per game (playerId + reason) for the report
      const removalsByGame = new Map<
        number,
        Array<{ playerId: number; playerName: string; reason: string }>
      >();
      for (const r of selected) {
        if (r.playerId == null) continue;
        const list = removalsByGame.get(r.gameId) ?? [];
        // Dedup — same {gameId, playerId} with multiple reasons → keep first
        if (!list.some((x) => x.playerId === r.playerId)) {
          list.push({
            playerId: r.playerId,
            playerName: r.playerName,
            reason: r.conflict,
          });
        }
        removalsByGame.set(r.gameId, list);
      }

      // --- CALL API ---
      const res = await fetch("/api/games/re-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: season.id,
          effectiveDate,
          targets,
          runAutoAssign,
          assignExtra,
          assignSubs,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        cleared?: number;
        filled?: number;
        stillEmpty?: number;
        rejected?: Array<{ gameId: number; reason: string }>;
        weeks?: Array<{ weekNumber: number; assignedCount: number; unfilled: number; error?: string }>;
        error?: string;
      };

      if (!res.ok || !data.success) {
        setApplyError(data.error || "Re-assignment failed.");
        setApplying(false);
        return;
      }

      // --- FETCH "after" state ---
      const afterGamesRes = await fetch(`/api/games?seasonId=${season.id}`);
      if (!afterGamesRes.ok) {
        setApplyError("Apply succeeded but failed to fetch updated games for report.");
        await loadBase();
        setConflicts(null);
        setCheckedKeys(new Set());
        setApplying(false);
        return;
      }
      const afterGames = (await afterGamesRes.json()) as Game[];
      const afterById = new Map(afterGames.map((g) => [g.id, g]));

      // --- BUILD CHANGE RECORDS ---
      const records: ChangeRecord[] = [];
      for (const gid of affectedGameIds) {
        const beforeGame = beforeSnapshot.get(gid);
        const afterGame = afterById.get(gid);
        if (!beforeGame || !afterGame) continue;

        const beforeIds = new Set(beforeGame.assignments.map((a) => a.playerId));
        const afterIds = new Set(afterGame.assignments.map((a) => a.playerId));
        const removedIds = [...beforeIds].filter((id) => !afterIds.has(id));
        const newIds = [...afterIds].filter((id) => !beforeIds.has(id));

        const slotLabel = (
          assignments: Assignment[],
          kind: "before" | "after"
        ): SlotDisplay[] => {
          const out: SlotDisplay[] = [];
          for (let slot = 1; slot <= 4; slot++) {
            const a = assignments.find((x) => x.slotPosition === slot);
            if (!a) {
              out.push({ playerId: null, label: "— Open —", isNew: false, isRemoved: false });
              continue;
            }
            const p = playerById.get(a.playerId);
            const label = p
              ? `${p.lastName}, ${p.firstName.charAt(0)}.`
              : `#${a.playerId}`;
            const isNew = kind === "after" && newIds.includes(a.playerId);
            const isRemoved = kind === "before" && removedIds.includes(a.playerId);
            out.push({ playerId: a.playerId, label, isNew, isRemoved });
          }
          return out;
        };

        records.push({
          game: afterGame,
          removed: removalsByGame.get(gid) ?? [],
          before: slotLabel(beforeGame.assignments, "before"),
          after: slotLabel(afterGame.assignments, "after"),
        });
      }

      // Sort records by date then game number
      records.sort((a, b) => {
        if (a.game.date !== b.game.date) return a.game.date.localeCompare(b.game.date);
        return a.game.gameNumber - b.game.gameNumber;
      });

      // --- SUMMARY BANNER ---
      const parts: string[] = [];
      parts.push(`[${groupLabel}] Cleared ${data.cleared ?? 0} assignment${(data.cleared ?? 0) !== 1 ? "s" : ""}`);
      if (runAutoAssign) {
        parts.push(`Filled ${data.filled ?? 0}`);
        if ((data.stillEmpty ?? 0) > 0) {
          parts.push(`${data.stillEmpty} still empty`);
        }
      } else {
        parts.push("manual fill needed on Schedule page");
      }
      if (data.rejected && data.rejected.length > 0) {
        parts.push(`${data.rejected.length} rejected (before effective date)`);
      }
      setApplyResult(parts.join(" • "));
      setChanges(records);

      // Update in-memory games so the next scan reflects new state, but don't wipe changes/banner
      setGames(afterGames);
      setConflicts(null);
      setCheckedKeys(new Set());
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  // --- Render ---
  return (
    <div className="max-w-6xl">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-bold">Re-Assign Games</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/schedule" className="text-primary hover:underline">
            Schedule →
          </Link>
          <Link href="/players" className="text-primary hover:underline">
            Players →
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border mb-4 flex gap-1">
        <button
          onClick={() => setActiveTab("conflicts")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] ${
            activeTab === "conflicts"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Conflicts
        </button>
        <button
          onClick={() => setActiveTab("swap")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] ${
            activeTab === "swap"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Swap
        </button>
      </div>

      {activeTab === "conflicts" && (
        <div className="bg-blue-50 border border-blue-200 text-sm text-blue-900 rounded p-3 mb-4">
          <p className="font-medium mb-1">How this works</p>
          <ol className="list-decimal ml-5 space-y-0.5">
            <li>First, update any changed player data (vacations, blocked days, active status, do-not-pair) on the <Link href="/players" className="underline">Players</Link> page.</li>
            <li>Set an <strong>Effective Change Date</strong> — games before this date won&apos;t be touched. Default is tomorrow; bump it further out if players need more notice.</li>
            <li>Click <strong>Scan for conflicts</strong>. Review the list.</li>
            <li>Uncheck any rows you don&apos;t want to act on, then click <strong>Apply Re-Assignment</strong>.</li>
            <li>After applying, re-export/re-email the affected weeks via the Reports / Communications pages.</li>
          </ol>
        </div>
      )}

      {activeTab === "swap" && (
        <div className="bg-purple-50 border border-purple-200 text-sm text-purple-900 rounded p-3 mb-4">
          <p className="font-medium mb-1">How this works</p>
          <ol className="list-decimal ml-5 space-y-0.5">
            <li>Pick the <strong>player</strong> who wants to swap out of a game.</li>
            <li>Click the <strong>game they want to give up</strong>.</li>
            <li>The system shows valid swap partners in the selected radius — <strong>same skill level</strong> only (a Solo game may be traded for a Don&apos;s game).</li>
            <li>Click <strong>Swap</strong> next to a candidate. Both assignments switch atomically.</li>
          </ol>
        </div>
      )}

      {loadingBase ? (
        <p className="text-muted">Loading...</p>
      ) : baseError ? (
        <p className="text-red-600">{baseError}</p>
      ) : !season ? (
        <p className="text-muted">No season data.</p>
      ) : activeTab === "conflicts" ? (
        <>
          {/* Controls */}
          <div className="border border-border rounded p-4 mb-4 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-muted mb-1">Season</label>
                <div className="border border-border rounded px-3 py-2 text-sm bg-muted-bg">
                  {season.startDate} → {season.endDate}
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Effective Change Date</label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  min={season.startDate}
                  max={season.endDate}
                  className="border border-border rounded px-3 py-2 text-sm w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Start Week</label>
                <input
                  type="number"
                  min={1}
                  max={season.totalWeeks}
                  value={weekStart}
                  onChange={(e) => {
                    const n = parseInt(e.target.value);
                    if (!isNaN(n) && n >= 1 && n <= season.totalWeeks) setWeekStart(n);
                  }}
                  className="border border-border rounded px-3 py-2 text-sm w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">End Week</label>
                <input
                  type="number"
                  min={1}
                  max={season.totalWeeks}
                  value={weekEnd}
                  onChange={(e) => {
                    const n = parseInt(e.target.value);
                    if (!isNaN(n) && n >= 1 && n <= season.totalWeeks) setWeekEnd(n);
                  }}
                  className="border border-border rounded px-3 py-2 text-sm w-full"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assignExtra}
                  onChange={(e) => setAssignExtra(e.target.checked)}
                />
                Also assign extra games
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assignSubs}
                  onChange={(e) => setAssignSubs(e.target.checked)}
                />
                Also assign subs to fill
              </label>
              <button
                onClick={runScan}
                className="ml-auto px-4 py-2 bg-primary text-white rounded text-sm font-medium hover:opacity-90"
              >
                Scan for conflicts
              </button>
            </div>

            <p className="text-xs text-muted mt-2">
              V1 detects: vacation, blocked day, inactive player, do-not-pair, incomplete game. Composition / consecutive-days / STD-deficit conflicts should be reviewed on the Schedule page directly.
            </p>
            <p className="text-xs text-muted mt-1">
              <strong>Don&apos;s</strong> re-assign clears the affected slots and auto-fills via auto-assign.{" "}
              <strong>Solo</strong> re-assign clears the affected slots only — Solo uses share-based assignment that can&apos;t be auto-recovered per-slot, so replacements are picked manually on the Schedule page.
            </p>
          </div>

          {/* Results */}
          {conflicts !== null && (
            <div className="border border-border rounded mb-4 bg-white">
              <div className="px-3 py-2 bg-muted-bg border-b border-border flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} found
                  {conflicts.length > 0 && (
                    <span className="text-muted ml-2">({checkedKeys.size} selected)</span>
                  )}
                </span>
                <div className="flex items-center gap-3 flex-wrap">
                  {conflicts.length > 0 && (
                    <button
                      onClick={toggleAll}
                      className="text-xs text-primary hover:underline"
                    >
                      {checkedKeys.size === conflicts.length ? "Clear all" : "Select all"}
                    </button>
                  )}
                  {(() => {
                    const donsSelected = conflicts.filter(
                      (r) => r.group === "dons" && checkedKeys.has(rowKey(r))
                    ).length;
                    const soloSelected = conflicts.filter(
                      (r) => r.group === "solo" && checkedKeys.has(rowKey(r))
                    ).length;
                    return (
                      <>
                        <button
                          onClick={() => runApply("dons")}
                          disabled={applying || donsSelected === 0}
                          className="px-3 py-1.5 bg-primary text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                          title="Clear affected Don's slots and re-run auto-assign for the week(s)"
                        >
                          {applying ? "Applying..." : `Re-Assign Don's (${donsSelected})`}
                        </button>
                        <button
                          onClick={() => runApply("solo")}
                          disabled={applying || soloSelected === 0}
                          className="px-3 py-1.5 bg-orange-600 text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                          title="Clear affected Solo slots only — Solo uses share-based assignment; fill manually on Schedule page"
                        >
                          {applying ? "Applying..." : `Re-Assign Solo (${soloSelected})`}
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>

              {conflicts.length === 0 ? (
                <p className="p-4 text-sm text-muted">
                  No conflicts in weeks {weekStart}–{weekEnd} on/after {effectiveDate}.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted-bg">
                      <tr>
                        <th className="w-8 p-2"></th>
                        <th className="text-left p-2">Week</th>
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Game#</th>
                        <th className="text-center p-2">Ct</th>
                        <th className="text-left p-2">Time</th>
                        <th className="text-left p-2">Group</th>
                        <th className="text-left p-2">Player</th>
                        <th className="text-left p-2">Conflict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conflicts.map((r, i) => {
                        const k = rowKey(r);
                        const checked = checkedKeys.has(k);
                        const jumpToSchedule = () =>
                          router.push(
                            `/schedule?week=${r.weekNumber}&gameId=${r.gameId}`
                          );
                        return (
                          <tr
                            key={k + ":" + i}
                            className={`border-t border-border cursor-pointer hover:bg-yellow-50 ${
                              r.severity === "warning" ? "bg-amber-50/40" : ""
                            }`}
                            onClick={jumpToSchedule}
                            title="Click any cell to open this game in the Schedule"
                          >
                            <td
                              className="p-2 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRow(r)}
                              />
                            </td>
                            <td className="p-2">{r.weekNumber}</td>
                            <td className="p-2 whitespace-nowrap">
                              {DAYS_SHORT[r.dayOfWeek]} {fmtDate(r.date)}
                            </td>
                            <td className="p-2">{r.gameNumber}</td>
                            <td className="p-2 text-center">{r.courtNumber}</td>
                            <td className="p-2">{fmtTime(r.startTime)}</td>
                            <td className="p-2">
                              {r.group === "solo" ? (
                                <span className="inline-flex items-center rounded bg-orange-100 text-orange-800 px-2 py-0.5 text-xs font-medium">
                                  Solo
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-medium">
                                  Don&apos;s
                                </span>
                              )}
                            </td>
                            <td className="p-2">{r.playerName}</td>
                            <td className="p-2">
                              <span
                                className={
                                  r.severity === "error"
                                    ? "text-red-700"
                                    : "text-amber-800"
                                }
                              >
                                {r.conflict}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Apply banners */}
          {applyResult && (
            <div className="border border-green-200 bg-green-50 text-green-900 rounded p-3 mb-4 text-sm">
              ✓ {applyResult}
            </div>
          )}
          {applyError && (
            <div className="border border-red-200 bg-red-50 text-red-800 rounded p-3 mb-4 text-sm">
              {applyError}
            </div>
          )}

          {/* Change report */}
          {changes && changes.length > 0 && (
            <div className="border border-border rounded mb-4 bg-white">
              <div className="px-3 py-2 bg-muted-bg border-b border-border flex items-center justify-between">
                <span className="text-sm font-medium">
                  Change report — {changes.length} game
                  {changes.length !== 1 ? "s" : ""} affected
                </span>
                <button
                  onClick={() => setChanges(null)}
                  className="text-xs text-muted hover:text-foreground"
                  title="Hide the report"
                >
                  Dismiss
                </button>
              </div>
              <div className="p-3 space-y-3">
                {changes.map((c) => (
                  <div
                    key={c.game.id}
                    className="border border-border rounded p-3"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
                      <span className="font-semibold text-sm">
                        Game #{c.game.gameNumber}
                      </span>
                      <span className="text-sm">
                        {DAYS_SHORT[c.game.dayOfWeek]} {fmtDate(c.game.date)}
                      </span>
                      <span className="text-sm">
                        {fmtTime(c.game.startTime)} · Court {c.game.courtNumber}
                      </span>
                      <span className="text-xs text-muted">
                        Week {c.game.weekNumber}
                      </span>
                      <Link
                        href={`/schedule?week=${c.game.weekNumber}&gameId=${c.game.id}`}
                        className="ml-auto text-xs text-primary hover:underline"
                        title="Open this game in the Schedule page"
                      >
                        View in Schedule →
                      </Link>
                    </div>

                    {c.removed.length > 0 && (
                      <p className="text-xs text-red-700 mb-2">
                        Removed:{" "}
                        {c.removed
                          .map((r) => `${r.playerName} (${r.reason})`)
                          .join(", ")}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted mb-1">
                          Before
                        </div>
                        <ol className="text-sm space-y-0.5">
                          {c.before.map((s, i) => (
                            <li
                              key={i}
                              className={
                                s.isRemoved
                                  ? "text-red-700 line-through"
                                  : s.playerId == null
                                    ? "text-muted italic"
                                    : ""
                              }
                            >
                              {i + 1}. {s.label}
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted mb-1">
                          After
                        </div>
                        <ol className="text-sm space-y-0.5">
                          {c.after.map((s, i) => (
                            <li
                              key={i}
                              className={
                                s.isNew
                                  ? "bg-green-100 text-green-900 font-semibold px-1 rounded"
                                  : s.playerId == null
                                    ? "text-muted italic"
                                    : ""
                              }
                            >
                              {i + 1}. {s.label}
                              {s.isNew && (
                                <span className="ml-2 text-xs text-green-700">
                                  ← new
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <SwapTab
          season={season}
          games={games}
          players={players}
          swapPlayerId={swapPlayerId}
          setSwapPlayerId={setSwapPlayerId}
          swapPlayerSearch={swapPlayerSearch}
          setSwapPlayerSearch={setSwapPlayerSearch}
          swapGameAId={swapGameAId}
          setSwapGameAId={setSwapGameAId}
          swapWeeksAhead={swapWeeksAhead}
          setSwapWeeksAhead={setSwapWeeksAhead}
          swapWeeksBack={swapWeeksBack}
          setSwapWeeksBack={setSwapWeeksBack}
          swapping={swapping}
          setSwapping={setSwapping}
          swapBanner={swapBanner}
          setSwapBanner={setSwapBanner}
          swapError={swapError}
          setSwapError={setSwapError}
          loadBase={loadBase}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Swap Tab — pick Player A, their game, then choose a same-skill same-group
// partner from nearby weeks.
// ===========================================================================

interface SwapTabProps {
  season: Season;
  games: Game[];
  players: Player[];
  swapPlayerId: number | null;
  setSwapPlayerId: (n: number | null) => void;
  swapPlayerSearch: string;
  setSwapPlayerSearch: (s: string) => void;
  swapGameAId: number | null;
  setSwapGameAId: (n: number | null) => void;
  swapWeeksAhead: number;
  setSwapWeeksAhead: (n: number) => void;
  swapWeeksBack: number;
  setSwapWeeksBack: (n: number) => void;
  swapping: boolean;
  setSwapping: (b: boolean) => void;
  swapBanner: string;
  setSwapBanner: (s: string) => void;
  swapError: string;
  setSwapError: (s: string) => void;
  loadBase: () => Promise<void>;
}

function SwapTab(props: SwapTabProps) {
  const {
    season, games, players,
    swapPlayerId, setSwapPlayerId,
    swapPlayerSearch, setSwapPlayerSearch,
    swapGameAId, setSwapGameAId,
    swapWeeksAhead, setSwapWeeksAhead,
    swapWeeksBack, setSwapWeeksBack,
    swapping, setSwapping,
    swapBanner, setSwapBanner,
    swapError, setSwapError,
    loadBase,
  } = props;

  const activePlayers = players.filter((p) => p.isActive);
  const playerById = new Map(players.map((p) => [p.id, p]));

  const playerA = swapPlayerId != null ? playerById.get(swapPlayerId) ?? null : null;
  const gameA = swapGameAId != null ? games.find((g) => g.id === swapGameAId) ?? null : null;
  const [gameNumberInput, setGameNumberInput] = useState("");
  const [gameDateInput, setGameDateInput] = useState("");

  // Player dropdown filtered by search
  const filteredPlayers = activePlayers
    .filter((p) =>
      `${p.lastName} ${p.firstName}`
        .toLowerCase()
        .includes(swapPlayerSearch.toLowerCase())
    )
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  //  The player's own upcoming games, listed by date to tap, as on the
  //  phone page. If the whole season is behind us, fall back to all of them
  //  so the list is not empty.
  const todayStr = new Date().toLocaleDateString("en-CA");
  const playerAAllGames = playerA
    ? games
        .filter(
          (g) =>
            g.status === "normal" &&
            (g.assignments ?? []).some((a) => a.playerId === playerA.id)
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.gameNumber - b.gameNumber)
    : [];
  const playerAUpcoming = playerAAllGames.filter((g) => g.date >= todayStr);
  const playerAGames = playerAUpcoming.length > 0 ? playerAUpcoming : playerAAllGames;

  //  Eligibility and candidate search now live in lib/swapSuggestions,
  //  shared with the public /swap-finder page so the two can never give
  //  different answers.
  function canPlayerTakeGame(
    pid: number,
    game: Game,
    excludeGameId?: number
  ): string | null {
    return whyCannotPlay(pid, game, players, games, excludeGameId);
  }
  void canPlayerTakeGame;

  interface Candidate {
    playerB: Player;
    gameY: Game;
    weekDistance: number;
  }

  //  Suggestions are produced on demand rather than as you type, so the
  //  list only changes when you ask for it.
  const [suggestions, setSuggestions] = useState<Candidate[] | null>(null);
  const [gameNumberError, setGameNumberError] = useState("");

  /** At most this many offered games per swap partner. */
  const MAX_GAMES_PER_PARTNER = 2;

  function computeCandidates(forGame: Game | null = gameA): Candidate[] {
    if (!playerA || !forGame) return [];
    return findSwapSuggestions({
      players,
      games,
      playerAId: playerA.id,
      gameAId: forGame.id,
      totalWeeks: season.totalWeeks,
      weeksBack: swapWeeksBack,
      weeksAhead: swapWeeksAhead,
      maxGamesPerPartner: MAX_GAMES_PER_PARTNER,
    });
  }

  const candidates = suggestions ?? [];

  //  The swap just made, kept so "Notify players" can email exactly it.
  const [lastSwap, setLastSwap] = useState<{
    gameAId: number; playerAId: number; gameBId: number; playerBId: number;
  } | null>(null);
  //  A game given away outright (no game back); notified the same way.
  const [lastHandoff, setLastHandoff] = useState<{
    gameId: number; fromPlayerId: number; toPlayerId: number;
  } | null>(null);
  const [handoffList, setHandoffList] = useState<ReturnType<typeof findHandoffCandidates<Player, Game>> | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");

  async function notifyPlayers() {
    const payload = lastSwap ?? lastHandoff;
    if (!payload) return;
    setNotifying(true);
    setNotifyMsg("");
    try {
      const res = await fetch(lastSwap ? "/api/games/swap-notify" : "/api/games/handoff-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        results?: { name: string; sent: boolean; via?: string; error?: string }[];
      };
      if (!res.ok || !data.results) {
        setNotifyMsg(data.error || "Could not send the notices.");
      } else {
        setNotifyMsg(
          data.results
            .map((r) => (r.sent ? `✓ Notified ${r.name}${r.via ? ` (${r.via})` : ""}` : `✗ ${r.name}: ${r.error ?? "not sent"}`))
            .join("   ")
        );
        if (data.results.every((r) => r.sent)) {
          setLastSwap(null);
          setLastHandoff(null);
        }
      }
    } catch (err) {
      setNotifyMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setNotifying(false);
    }
  }


  //  Changes made through delegates' private links, newest first.
  const [delegateLog, setDelegateLog] = useState<
    { id: number; summary: string; createdAt: string }[] | null
  >(null);
  useEffect(() => {
    fetch("/api/games/swap-log")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setDelegateLog(Array.isArray(rows) ? rows : []))
      .catch(() => setDelegateLog([]));
  }, [swapBanner]);

  const candidatesRef = useRef<HTMLDivElement | null>(null);

  /**
   * Suggest, from whatever the boxes say right now. It re-resolves the game
   * from the date or number box instead of trusting earlier state, then
   * scrolls the partner list into view: it sits below the player's own
   * games, and a result you cannot see reads as "nothing happened".
   */
  function runSuggest(forGame: Game | null = null) {
    const g = forGame ?? gameA;
    if (!g) return;
    setSwapGameAId(g.id);
    setSwapBanner("");
    setSwapError("");
    setSuggestions(computeCandidates(g));
    setTimeout(
      () => candidatesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50
    );
  }

  /** Choose a game: fills the quick-entry boxes and runs the search for it. */
  function pickGameA(g: Game) {
    if (!playerA) return;
    setSwapGameAId(g.id);
    setGameNumberInput(String(g.gameNumber));
    setGameDateInput(g.date);
    setGameNumberError("");
    setSwapBanner("");
    setSwapError("");
    setNotifyMsg("");
    //  Both answers at once: who could swap for it, and who could simply
    //  take it. The choice is made at the button, not up front.
    runSuggest(g);
    setHandoffList(findHandoffCandidates({ players, games, playerAId: playerA.id, gameAId: g.id }));
  }

  /** Jump straight to a game typed by number or chosen by date. */
  function jumpToGame(game: Game | null, err: string) {
    if (!game) {
      setGameNumberError(err);
      return;
    }
    pickGameA(game);
  }

  /** Give gameA away outright to `to`; nothing comes back. */
  const performHandoff = async (to: Player, isSub: boolean) => {
    if (!playerA || !gameA) return;
    const msg =
      `Give Game #${gameA.gameNumber} (${fmtDate(gameA.date)}, ${fmtTime(gameA.startTime)}) ` +
      `from ${playerA.lastName}, ${playerA.firstName} to ${to.lastName}, ${to.firstName}` +
      `${isSub ? " (a sub)" : ""}? Nothing comes back to ${playerA.firstName}.`;
    if (!window.confirm(msg)) return;
    setSwapping(true);
    setSwapBanner("");
    setSwapError("");
    setLastSwap(null);
    setLastHandoff(null);
    setNotifyMsg("");
    try {
      const res = await fetch("/api/games/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: gameA.id, fromPlayerId: playerA.id, toPlayerId: to.id }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setSwapError(data.error || "Hand-off failed.");
      } else {
        setSwapBanner(
          `✓ ${to.lastName}, ${to.firstName} now has Game #${gameA.gameNumber} (${fmtDate(gameA.date)}); ` +
          `${playerA.lastName}, ${playerA.firstName} is out of it.`
        );
        setLastHandoff({ gameId: gameA.id, fromPlayerId: playerA.id, toPlayerId: to.id });
        setHandoffList(null);
        await loadBase();
        setSwapGameAId(null);
        setGameNumberInput("");
        setGameDateInput("");
        setSuggestions(null);
      }
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwapping(false);
    }
  };

  const performSwap = async (c: Candidate) => {
    if (!playerA || !gameA) return;
    const confirmMsg =
      `Swap ${playerA.lastName}, ${playerA.firstName} (Game #${gameA.gameNumber}, ${fmtDate(gameA.date)}) ` +
      `with ${c.playerB.lastName}, ${c.playerB.firstName} (Game #${c.gameY.gameNumber}, ${fmtDate(c.gameY.date)})?`;
    if (!window.confirm(confirmMsg)) return;

    setSwapping(true);
    setSwapBanner("");
    setLastSwap(null);
    setLastHandoff(null);
    setNotifyMsg("");
    setSwapError("");
    try {
      const res = await fetch("/api/games/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameAId: gameA.id,
          playerAId: playerA.id,
          gameBId: c.gameY.id,
          playerBId: c.playerB.id,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setSwapError(data.error || "Swap failed.");
      } else {
        setSwapBanner(
          `✓ Swapped: ${playerA.lastName}, ${playerA.firstName} → Game #${c.gameY.gameNumber} (${fmtDate(c.gameY.date)}) ` +
          `and ${c.playerB.lastName}, ${c.playerB.firstName} → Game #${gameA.gameNumber} (${fmtDate(gameA.date)})`
        );
        setLastSwap({
          gameAId: gameA.id,
          playerAId: playerA.id,
          gameBId: c.gameY.id,
          playerBId: c.playerB.id,
        });
        // Reload games so the lists reflect new state
        await loadBase();
        // Clear selections so user starts fresh for next swap
        setSwapGameAId(null);
      }
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwapping(false);
    }
  };

  const bar = "w-full flex items-center justify-between border-2 border-blue-600 bg-blue-50 rounded-xl px-4 py-4 text-left";
  const bigBtn = "rounded-xl px-5 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50";

  const phoneLink = (cell: string | null) =>
    cell ? (
      <a href={`tel:${cell.replace(/\D/g, "")}`} className="text-lg font-bold text-blue-700 underline">
        {formatPhone(cell)}
      </a>
    ) : (
      <span className="text-base text-gray-500">no cell number</span>
    );

  //  One card per partner, as on the phone page.
  const groups: { playerB: Player; cands: Candidate[] }[] = [];
  for (const c of candidates) {
    let grp = groups.find((x) => x.playerB.id === c.playerB.id);
    if (!grp) {
      grp = { playerB: c.playerB, cands: [] };
      groups.push(grp);
    }
    grp.cands.push(c);
  }

  //  Why nobody fits: one line per same-skill player, so an empty result
  //  explains itself instead of looking like nothing happened.
  const whyNot = (kind: "swap" | "handoff") => {
    if (!playerA || !gameA) return null;
    const rs = explainNoMatch({
      players, games, playerAId: playerA.id, gameAId: gameA.id,
      totalWeeks: season.totalWeeks, weeksBack: swapWeeksBack, weeksAhead: swapWeeksAhead, kind,
    });
    if (rs.length === 0) {
      return <p className="mt-3 text-sm">No other active player has skill level {playerA.skillLevel || "—"}.</p>;
    }
    return (
      <div className="mt-3 text-sm">
        <p className="font-medium mb-1">Why no one fits (skill {playerA.skillLevel || "—"}):</p>
        <ul className="list-disc pl-5 space-y-0.5">
          {rs.map((r) => (
            <li key={r.name}><strong>{r.name}</strong> — {r.reason}</li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-sm text-gray-500 mb-5">Swap a game with another player, or give it away.</p>

      {/* Banners */}
      {swapBanner && (
        <div className="border-2 border-green-200 bg-green-50 text-green-900 rounded-xl p-4 text-base mb-5">
          {swapBanner}
          {(lastSwap || lastHandoff || notifyMsg) && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {(lastSwap || lastHandoff) && (
                <button
                  onClick={notifyPlayers}
                  disabled={notifying}
                  className={bigBtn}
                  title="Email both players what changed, with calendar files to remove the old game and add the new one"
                >
                  {notifying ? "Sending..." : "Notify players"}
                </button>
              )}
              {notifyMsg && <span className="text-sm">{notifyMsg}</span>}
            </div>
          )}
        </div>
      )}
      {swapError && (
        <div className="border-2 border-red-200 bg-red-50 text-red-800 rounded-xl px-4 py-3 text-base mb-5">
          {swapError}
        </div>
      )}

      {/* Step 1 — who */}
      {(
        <div className="mb-5">
          <div className="text-base font-semibold mb-2">
            1. Who can&apos;t play?
          </div>
          {playerA ? (
            <button
              onClick={() => {
                setSwapPlayerId(null);
                setSwapGameAId(null);
                setSuggestions(null);
                setHandoffList(null);
                setGameNumberInput("");
                setGameDateInput("");
                setGameNumberError("");
                setSwapBanner("");
                setSwapError("");
              }}
              className={bar}
            >
              <span className="text-lg font-semibold">
                {playerA.lastName}, {playerA.firstName}{" "}
                <span className="text-sm text-gray-500 font-normal">({playerA.skillLevel || "—"})</span>
              </span>
              <span className="text-sm text-blue-700 underline">change</span>
            </button>
          ) : (
            <>
              <input
                type="text"
                value={swapPlayerSearch}
                onChange={(e) => setSwapPlayerSearch(e.target.value)}
                placeholder="Type a name…"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg mb-2"
              />
              <div className="border-2 border-gray-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {filteredPlayers.length === 0 ? (
                  <p className="px-4 py-3 text-gray-500">No one matches that.</p>
                ) : (
                  filteredPlayers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSwapPlayerId(p.id);
                        setSwapGameAId(null);
                        setSuggestions(null);
                        setHandoffList(null);
                        setGameNumberInput("");
                        setGameDateInput("");
                        setGameNumberError("");
                        setSwapBanner("");
                        setSwapError("");
                      }}
                      className="w-full text-left px-4 py-3 text-lg border-b border-gray-100 last:border-b-0 hover:bg-blue-50"
                    >
                      {p.lastName}, {p.firstName}
                      <span className="text-sm text-gray-500 ml-2">({p.skillLevel || "—"})</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2 — which date */}
      {playerA && (
        <div className="mb-5">
          <div className="text-base font-semibold mb-2">2. Which date can&apos;t they play?</div>
          {gameA ? (
            <button
              onClick={() => {
                setSwapGameAId(null);
                setSuggestions(null);
                setHandoffList(null);
                setGameNumberInput("");
                setGameDateInput("");
                setGameNumberError("");
              }}
              className={bar}
            >
              <span>
                <span className="block text-lg font-semibold">
                  {DAYS_SHORT[gameA.dayOfWeek]} {fmtDate(gameA.date)}
                </span>
                <span className="block text-base text-gray-600">
                  {fmtTime(gameA.startTime)} · Court {gameA.courtNumber} ·{" "}
                  {gameA.group === "solo" ? "SOLO" : "Don's"} · Game #{gameA.gameNumber}
                </span>
              </span>
              <span className="text-sm text-blue-700 underline shrink-0 ml-3">change</span>
            </button>
          ) : (
            <>
              {/* Quick entry, for when the game number or date is already known */}
              <div className="flex flex-wrap items-end gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Game #</label>
                  <input
                    type="number"
                    value={gameNumberInput}
                    onChange={(e) => {
                      setGameNumberInput(e.target.value);
                      if (e.target.value.trim() !== "") setGameDateInput("");
                      setGameNumberError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const n = parseInt(gameNumberInput.trim(), 10);
                      const g = games.find((x) => x.gameNumber === n && x.status === "normal");
                      const mine = g && (g.assignments ?? []).some((a) => a.playerId === playerA.id);
                      jumpToGame(
                        mine ? g! : null,
                        g ? `${playerA.lastName}, ${playerA.firstName} is not in game #${n}.` : `No game #${gameNumberInput} in this season.`
                      );
                    }}
                    placeholder="e.g. 412"
                    className="border-2 border-gray-300 rounded-xl px-3 py-2 text-base w-28"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">or Date</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={gameDateInput}
                    onChange={(e) => {
                      setGameDateInput(e.target.value);
                      setGameNumberInput("");
                      setGameNumberError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      e.currentTarget.blur();
                    }}
                    onBlur={() => {
                      if (!gameDateInput.trim()) return;
                      const r = matchGameDate(gameDateInput, playerAAllGames);
                      jumpToGame(r.game, r.error ? `${playerA.lastName}, ${playerA.firstName}: ${r.error}` : "");
                    }}
                    placeholder="month/day, e.g. 3/10"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="border-2 border-gray-300 rounded-xl px-3 py-2 text-base w-44"
                  />
                </div>
                {gameNumberError && <span className="text-sm text-red-600">{gameNumberError}</span>}
              </div>
              {playerAGames.length === 0 ? (
                <p className="text-base text-gray-600 border-2 border-gray-200 rounded-xl px-4 py-4">
                  {playerA.firstName} has no games left.
                </p>
              ) : (
                <div className="border-2 border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                  {playerAGames.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => pickGameA(g)}
                      className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-blue-50"
                    >
                      <div className="text-lg font-semibold">
                        {DAYS_SHORT[g.dayOfWeek]} {fmtDate(g.date)}
                      </div>
                      <div className="text-base text-gray-600">
                        {fmtTime(g.startTime)} · Court {g.courtNumber} ·{" "}
                        {g.group === "solo" ? "SOLO" : "Don's"} · Game #{g.gameNumber}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Results — swap */}
      {playerA && gameA && suggestions !== null && (
        <div ref={candidatesRef} className="scroll-mt-4 mb-5">
          <div className="text-base font-semibold mb-2">
            {groups.length === 0
              ? "Swap — no one can trade for this game"
              : `Swap — ${groups.length} player${groups.length !== 1 ? "s" : ""} could trade for it`}
          </div>

          {/* Search window around the chosen game */}
          <div className="flex flex-wrap items-end gap-3 mb-3 text-sm text-gray-600">
            <span>
              Searching weeks {Math.max(1, gameA.weekNumber - swapWeeksBack)}–
              {Math.min(season.totalWeeks, gameA.weekNumber + swapWeeksAhead)} around week {gameA.weekNumber}.
            </span>
            <label className="flex items-center gap-1">
              back
              <input
                type="number"
                min={0}
                max={season.totalWeeks}
                value={swapWeeksBack}
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  if (!isNaN(n) && n >= 0) setSwapWeeksBack(n);
                }}
                className="border border-gray-300 rounded px-2 py-1 w-16"
              />
            </label>
            <label className="flex items-center gap-1">
              ahead
              <input
                type="number"
                min={0}
                max={season.totalWeeks}
                value={swapWeeksAhead}
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  if (!isNaN(n) && n >= 0) setSwapWeeksAhead(n);
                }}
                className="border border-gray-300 rounded px-2 py-1 w-16"
              />
            </label>
            <button onClick={() => runSuggest()} className="text-blue-700 underline">
              Search again
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="text-base text-gray-600 border-2 border-gray-200 rounded-xl px-4 py-4">
              Nobody of the same level is free for this game in these weeks. Widen the window and
              search again.
              {whyNot("swap")}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((grp) => (
                <div key={grp.playerB.id} className="border-2 border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b-2 border-gray-200">
                    <div className="text-lg font-semibold">
                      {grp.playerB.lastName}, {grp.playerB.firstName}
                    </div>
                    {phoneLink(grp.playerB.cellNumber)}
                  </div>
                  <div className="px-4 py-2">
                    <div className="text-sm text-gray-500 mb-1">can give you one of these:</div>
                    {grp.cands.map((c) => (
                      <div
                        key={c.gameY.id}
                        className="py-2 border-b border-gray-100 last:border-b-0 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-lg font-medium">Game #{c.gameY.gameNumber}</div>
                          <div className="text-base">
                            {DAYS_SHORT[c.gameY.dayOfWeek]} {fmtDate(c.gameY.date)} · {fmtTime(c.gameY.startTime)} · Court{" "}
                            {c.gameY.courtNumber}
                            <span className="text-sm text-gray-500">
                              {" "}({c.weekDistance === 0 ? "same week" : `±${c.weekDistance} wk`})
                            </span>
                          </div>
                        </div>
                        <button onClick={() => performSwap(c)} disabled={swapping} className={`${bigBtn} shrink-0`}>
                          {swapping ? "..." : "Swap"}
                        </button>
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
      {playerA && gameA && handoffList !== null && (
        <div className="mb-5">
          <div className="text-base font-semibold mb-2">
            {handoffList.length === 0
              ? "Or give it away — no one can take it"
              : `Or give it away — ${handoffList.length} player${handoffList.length !== 1 ? "s" : ""} could take it`}
          </div>
          {handoffList.length === 0 ? (
            <div className="text-base text-gray-600 border-2 border-gray-200 rounded-xl px-4 py-4">
              Nobody of skill {playerA.skillLevel || "—"} is free for this game.
              {whyNot("handoff")}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Same skill level. Contract players first, then subs (a paid substitution). Nothing comes
                back to {playerA.firstName}; the four players are reminded the evening before.
              </p>
              {handoffList.map(({ player: p, isSub }) => (
                <div key={p.id} className="border-2 border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">
                        {p.lastName}, {p.firstName}
                        {isSub && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">Sub</span>
                        )}
                      </div>
                      {phoneLink(p.cellNumber)}
                    </div>
                    <button onClick={() => performHandoff(p, isSub)} disabled={swapping} className={`${bigBtn} shrink-0`}>
                      Give game
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {delegateLog && delegateLog.length > 0 && (
        <div className="border border-border rounded bg-white">
          <div className="px-3 py-2 border-b border-border bg-muted-bg text-sm font-medium">
            Changes made through swap-admin links (latest 50)
          </div>
          <ul className="p-3 text-xs space-y-1 max-h-60 overflow-y-auto">
            {delegateLog.map((r) => (
              <li key={r.id}>
                <span className="text-muted">{new Date(r.createdAt).toLocaleString()}</span> — {r.summary}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
