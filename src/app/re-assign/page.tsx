"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  contractedFrequency: string;
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
  const [assignExtra, setAssignExtra] = useState(false);
  const [assignCSubs, setAssignCSubs] = useState(false);

  // Scan results
  const [conflicts, setConflicts] = useState<ConflictRow[] | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());

  // Apply results
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string>("");
  const [applyError, setApplyError] = useState<string>("");
  const [changes, setChanges] = useState<ChangeRecord[] | null>(null);

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
          assignCSubs,
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

      {loadingBase ? (
        <p className="text-muted">Loading...</p>
      ) : baseError ? (
        <p className="text-red-600">{baseError}</p>
      ) : !season ? (
        <p className="text-muted">No season data.</p>
      ) : (
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
                  checked={assignCSubs}
                  onChange={(e) => setAssignCSubs(e.target.checked)}
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
      )}
    </div>
  );
}
