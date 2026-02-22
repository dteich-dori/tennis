"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

interface Season {
  id: number;
  startDate: string;
  endDate: string;
  maxDeratedPerWeek: number | null;
}

interface Holiday {
  id: number;
  seasonId: number;
  date: string;
  name: string;
}

export default function SeasonPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [startDate, setStartDate] = useState("");
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [error, setError] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetStatus, setResetStatus] = useState<"" | "backing-up" | "resetting" | "done" | "error">("");
  const [backupResult, setBackupResult] = useState("");
  const [maxDeratedPerWeek, setMaxDeratedPerWeek] = useState<string>("none");

  // Regenerate games state
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState("");
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [totalGames, setTotalGames] = useState(0);

  // Solo auto-assign state
  const [soloAssigning, setSoloAssigning] = useState(false);
  const [soloAssignMessage, setSoloAssignMessage] = useState("");
  const [soloAssignLog, setSoloAssignLog] = useState<
    { type: string; week?: number; message: string }[]
  >([]);

  // Solo balls balance state
  const [soloBallsBalancing, setSoloBallsBalancing] = useState(false);
  const [soloBallsMessage, setSoloBallsMessage] = useState("");
  const [soloBallsSummary, setSoloBallsSummary] = useState<
    { playerId: number; totalGames: number; ballsBrought: number; expected: number }[] | null
  >(null);
  const [playerNameMap, setPlayerNameMap] = useState<Map<number, string>>(new Map());

  // Don's balls balance state
  const [donsBallsBalancing, setDonsBallsBalancing] = useState(false);
  const [donsBallsMessage, setDonsBallsMessage] = useState("");
  const [donsBallsSummary, setDonsBallsSummary] = useState<
    { playerId: number; totalGames: number; ballsBrought: number; expected: number }[] | null
  >(null);

  // Clear all assignments state
  const [clearingAll, setClearingAll] = useState(false);
  const [clearAllMessage, setClearAllMessage] = useState("");

  const loadSeasons = useCallback(async () => {
    const res = await fetch("/api/seasons");
    const data = (await res.json()) as Season[];
    setSeasons(data);
    if (data.length > 0) {
      const latest = data[data.length - 1];
      setActiveSeason(latest);
      setStartDate(latest.startDate);
      setMaxDeratedPerWeek(latest.maxDeratedPerWeek != null ? String(latest.maxDeratedPerWeek) : "none");
    }
  }, []);

  const loadHolidays = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/holidays?seasonId=${seasonId}`);
    const data = (await res.json()) as Holiday[];
    setHolidays(data);
  }, []);

  const loadGamesCount = useCallback(async (seasonId: number) => {
    try {
      const res = await fetch(`/api/games?seasonId=${seasonId}&countOnly=true`);
      const data = (await res.json()) as { count: number };
      setTotalGames(data.count);
    } catch (err) {
      console.error("Failed to load games count:", err);
    }
  }, []);

  useEffect(() => {
    loadSeasons();
  }, [loadSeasons]);

  useEffect(() => {
    if (activeSeason) {
      loadHolidays(activeSeason.id);
      loadGamesCount(activeSeason.id);
    }
  }, [activeSeason, loadHolidays, loadGamesCount]);

  const validateMonday = (dateStr: string): boolean => {
    const date = new Date(dateStr + "T00:00:00");
    return date.getDay() === 1;
  };

  const handleGenerate = async () => {
    if (!activeSeason) return;

    // If games already exist, require confirmation first
    if (totalGames > 0 && !confirmGenerate) {
      setConfirmGenerate(true);
      return;
    }
    setConfirmGenerate(false);
    setGenerating(true);
    setGenerateMessage("");

    try {
      const res = await fetch("/api/games/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: activeSeason.id }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        gamesGenerated?: number;
        holidayGames?: number;
        error?: string;
      };

      if (data.success) {
        setGenerateMessage(
          `Generated ${data.gamesGenerated} games (${data.holidayGames} on holidays)`
        );
        await loadGamesCount(activeSeason.id);
      } else {
        setGenerateMessage(`Error: ${data.error}`);
      }
    } catch {
      setGenerateMessage("Failed to generate games");
    }

    setGenerating(false);
  };

  const handleSaveSeason = async () => {
    setError("");
    if (!startDate) {
      setError("Please select a start date.");
      return;
    }
    if (!validateMonday(startDate)) {
      setError("Start date must be a Monday.");
      return;
    }

    const deratedValue = maxDeratedPerWeek === "none" ? null : parseInt(maxDeratedPerWeek);
    if (activeSeason) {
      await fetch("/api/seasons", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeSeason.id, startDate, maxDeratedPerWeek: deratedValue }),
      });
    } else {
      await fetch("/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, maxDeratedPerWeek: deratedValue }),
      });
    }
    await loadSeasons();
  };

  const handleAddHoliday = async () => {
    if (!activeSeason || !holidayDate) return;

    await fetch("/api/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seasonId: activeSeason.id, date: holidayDate, name: holidayName }),
    });
    setHolidayDate("");
    setHolidayName("");
    await loadHolidays(activeSeason.id);
  };

  const handleRemoveHoliday = async (id: number) => {
    await fetch(`/api/holidays?id=${id}`, { method: "DELETE" });
    if (activeSeason) {
      await loadHolidays(activeSeason.id);
    }
  };

  const handleResetSeason = async () => {
    if (!activeSeason || resetConfirmText !== "DELETE") return;

    // Step 1: Create automatic backup
    setResetStatus("backing-up");
    setBackupResult("");
    try {
      const backupRes = await fetch("/api/backup", { method: "POST" });
      const backupData = (await backupRes.json()) as {
        success?: boolean;
        folder?: string;
        counts?: { players: number; courtSchedules: number; games: number };
        error?: string;
      };
      if (!backupRes.ok || !backupData.success) {
        setResetStatus("error");
        setBackupResult(`Backup failed: ${backupData.error ?? "Unknown error"}. Reset cancelled.`);
        return;
      }
      setBackupResult(
        `Backup saved to Backup/${backupData.folder}/ (${backupData.counts?.players ?? 0} players, ${backupData.counts?.courtSchedules ?? 0} courts, ${backupData.counts?.games ?? 0} games)`
      );
    } catch {
      setResetStatus("error");
      setBackupResult("Backup failed: could not reach server. Reset cancelled.");
      return;
    }

    // Step 2: Perform the reset
    setResetStatus("resetting");
    await fetch("/api/seasons?all=true", { method: "DELETE" });
    setActiveSeason(null);
    setStartDate("");
    setHolidays([]);
    setSeasons([]);
    setResetStatus("done");

    // Auto-hide after 5 seconds
    setTimeout(() => {
      setShowResetConfirm(false);
      setResetConfirmText("");
      setResetStatus("");
      setBackupResult("");
    }, 5000);
  };

  const handleSoloAssign = async () => {
    if (!activeSeason) return;
    setSoloAssigning(true);
    setSoloAssignMessage("");
    setSoloAssignLog([]);
    try {
      const res = await fetch("/api/games/solo-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: activeSeason.id }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        assignedCount?: number;
        totalSlots?: number;
        unfilled?: number;
        error?: string;
        log?: { type: string; week?: number; message: string }[];
      };
      if (!res.ok) {
        setSoloAssignMessage(`Error: ${data.error}`);
        if (data.log) setSoloAssignLog(data.log);
      } else {
        setSoloAssignMessage(
          `Assigned ${data.assignedCount} of ${data.totalSlots} solo slots.${
            data.unfilled ? ` ${data.unfilled} unfilled.` : " All filled!"
          }`
        );
        setSoloAssignLog(data.log ?? []);
      }
    } catch {
      setSoloAssignMessage("Failed to auto-assign solo games.");
    }
    setSoloAssigning(false);
  };

  const handleClearAllAssignments = async () => {
    if (!activeSeason) return;
    if (!confirm("Clear ALL player assignments (Don's and Solo) for the entire season? Games and players will be preserved.")) return;
    setClearingAll(true);
    setClearAllMessage("");
    try {
      const res = await fetch("/api/games/clear-assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: activeSeason.id }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        deletedCount?: number;
        error?: string;
      };
      if (res.ok) {
        setClearAllMessage(`Cleared ${data.deletedCount} assignments (Don's + Solo).`);
      } else {
        setClearAllMessage(`Error: ${data.error}`);
      }
    } catch {
      setClearAllMessage("Failed to clear assignments.");
    }
    setClearingAll(false);
  };

  const handleClearSoloAssign = async () => {
    if (!activeSeason) return;
    if (!confirm("Clear ALL solo game assignments for the entire season?")) return;
    setSoloAssigning(true);
    setSoloAssignMessage("");
    setSoloAssignLog([]);
    try {
      const res = await fetch("/api/games/solo-assign", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: activeSeason.id }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        deletedCount?: number;
        error?: string;
      };
      if (res.ok) {
        setSoloAssignMessage(`Cleared ${data.deletedCount} solo assignments.`);
      } else {
        setSoloAssignMessage(`Error: ${data.error}`);
      }
    } catch {
      setSoloAssignMessage("Failed to clear solo assignments.");
    }
    setSoloAssigning(false);
  };

  const handleBalanceSoloBalls = async () => {
    if (!activeSeason) return;
    setSoloBallsBalancing(true);
    setSoloBallsMessage("");
    setSoloBallsSummary(null);
    try {
      // Load player names for the summary display
      const playersRes = await fetch(`/api/players?seasonId=${activeSeason.id}`);
      const playersData = (await playersRes.json()) as { id: number; firstName: string; lastName: string }[];
      const nameMap = new Map<number, string>();
      for (const p of playersData) {
        nameMap.set(p.id, `${p.firstName} ${p.lastName}`);
      }
      setPlayerNameMap(nameMap);

      const res = await fetch("/api/games/balance-balls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: activeSeason.id, group: "solo", allWeeks: true }),
      });
      const data = (await res.json()) as {
        swaps?: number;
        imbalance?: number;
        error?: string;
        playerSummary?: { playerId: number; totalGames: number; ballsBrought: number; expected: number }[];
      };
      if (!res.ok) {
        setSoloBallsMessage(`Error: ${data.error}`);
      } else {
        setSoloBallsMessage(
          `Balanced solo balls across all weeks: ${data.swaps} swap${data.swaps !== 1 ? "s" : ""} applied.`
        );
        if (data.playerSummary) setSoloBallsSummary(data.playerSummary);
      }
    } catch {
      setSoloBallsMessage("Failed to balance solo balls.");
    }
    setSoloBallsBalancing(false);
  };

  const handleBalanceDonsBalls = async () => {
    if (!activeSeason) return;
    setDonsBallsBalancing(true);
    setDonsBallsMessage("");
    setDonsBallsSummary(null);
    try {
      // Load player names for the summary display (reuse playerNameMap if already loaded)
      if (playerNameMap.size === 0) {
        const playersRes = await fetch(`/api/players?seasonId=${activeSeason.id}`);
        const playersData = (await playersRes.json()) as { id: number; firstName: string; lastName: string }[];
        const nameMap = new Map<number, string>();
        for (const p of playersData) {
          nameMap.set(p.id, `${p.firstName} ${p.lastName}`);
        }
        setPlayerNameMap(nameMap);
      }

      const res = await fetch("/api/games/balance-balls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: activeSeason.id, group: "dons", allWeeks: true }),
      });
      const data = (await res.json()) as {
        swaps?: number;
        imbalance?: number;
        error?: string;
        playerSummary?: { playerId: number; totalGames: number; ballsBrought: number; expected: number }[];
      };
      if (!res.ok) {
        setDonsBallsMessage(`Error: ${data.error}`);
      } else {
        setDonsBallsMessage(
          `Balanced Don's balls across all weeks: ${data.swaps} swap${data.swaps !== 1 ? "s" : ""} applied.`
        );
        if (data.playerSummary) setDonsBallsSummary(data.playerSummary);
      }
    } catch {
      setDonsBallsMessage("Failed to balance Don's balls.");
    }
    setDonsBallsBalancing(false);
  };

  const endDateDisplay = startDate && validateMonday(startDate)
    ? (() => {
        const d = new Date(startDate + "T00:00:00");
        d.setDate(d.getDate() + 36 * 7 - 1);
        return d.toISOString().split("T")[0];
      })()
    : "";

  // Compute common US holidays for the season date range
  const commonHolidays = useMemo(() => {
    if (!startDate || !endDateDisplay) return [];

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    // Nth weekday of a month (e.g., 3rd Monday of January)
    const nthWeekday = (year: number, month: number, weekday: number, n: number): Date => {
      const first = new Date(year, month, 1);
      const firstDay = first.getDay();
      let day = 1 + ((weekday - firstDay + 7) % 7) + (n - 1) * 7;
      return new Date(year, month, day);
    };

    // Last weekday of a month
    const lastWeekday = (year: number, month: number, weekday: number): Date => {
      const last = new Date(year, month + 1, 0); // last day of month
      const lastDay = last.getDay();
      const diff = (lastDay - weekday + 7) % 7;
      return new Date(year, month, last.getDate() - diff);
    };

    const seasonStart = new Date(startDate + "T00:00:00");
    const seasonEnd = new Date(endDateDisplay + "T00:00:00");

    // Collect years the season spans
    const years = new Set<number>();
    years.add(seasonStart.getFullYear());
    years.add(seasonEnd.getFullYear());

    const all: { date: string; name: string }[] = [];

    for (const year of years) {
      const candidates = [
        { date: new Date(year, 0, 1), name: "New Year's Day" },
        { date: nthWeekday(year, 0, 1, 3), name: "MLK Day" },
        { date: nthWeekday(year, 1, 1, 3), name: "Presidents' Day" },
        { date: lastWeekday(year, 4, 1), name: "Memorial Day" },
        { date: new Date(year, 5, 19), name: "Juneteenth" },
        { date: new Date(year, 6, 4), name: "Independence Day" },
        { date: nthWeekday(year, 8, 1, 1), name: "Labor Day" },
        { date: nthWeekday(year, 9, 1, 2), name: "Columbus Day" },
        { date: new Date(year, 10, 11), name: "Veterans Day" },
        { date: nthWeekday(year, 10, 4, 4), name: "Thanksgiving" },
        { date: new Date(year, 11, 25), name: "Christmas" },
      ];

      for (const c of candidates) {
        if (c.date >= seasonStart && c.date <= seasonEnd) {
          all.push({ date: fmt(c.date), name: c.name });
        }
      }
    }

    // Filter out holidays already added
    const existingDates = new Set(holidays.map((h) => h.date));
    return all.filter((h) => !existingDates.has(h.date));
  }, [startDate, endDateDisplay, holidays]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Season Setup</h1>

      {/* Season Dates + Reset + Clear All */}
      <div className="border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-4">Season</h2>
        {error && (
          <div className="text-danger text-sm mb-3">{error}</div>
        )}
        <div className="flex gap-4 items-end mb-4">
          <div>
            <label className="block text-sm text-muted mb-1">
              Start Date (must be a Monday)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">
              End Date (auto-calculated)
            </label>
            <input
              type="date"
              value={endDateDisplay}
              disabled
              className="border border-border rounded px-3 py-2 text-sm bg-gray-50"
            />
          </div>
        </div>
        <div className="text-sm text-muted mb-3">36-week season</div>

        {/* Derated Player Settings - inline */}
        <div className="flex gap-4 items-end mb-4">
          <div>
            <label className="block text-sm text-muted mb-1">
              Same Derated Player Pairing Frequency
            </label>
            <select
              value={maxDeratedPerWeek}
              onChange={(e) => setMaxDeratedPerWeek(e.target.value)}
              className="border border-border rounded px-3 py-2 text-sm"
            >
              <option value="none">No limit</option>
              <option value="1">Once per week</option>
              <option value="2">Once per two weeks</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={handleSaveSeason}
            title="Saves the start date and derated pairing frequency settings for this season"
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
          >
            {activeSeason ? "Update Season" : "Create Season"}
          </button>
          {activeSeason && !showResetConfirm && (
            <button
              onClick={() => setShowResetConfirm(true)}
              title="Permanently deletes the season, all holidays, games, and assignments. A backup is created automatically before reset."
              className="border border-danger text-danger px-4 py-2 rounded text-sm hover:bg-red-50 transition-colors"
            >
              Reset Season
            </button>
          )}
          {activeSeason && totalGames > 0 && (
            <button
              onClick={handleClearAllAssignments}
              disabled={clearingAll}
              title="Removes all player assignments (Don's and Solo) for every week. Games, players, and holidays are preserved."
              className="border border-danger text-danger px-4 py-2 rounded text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {clearingAll ? "Clearing..." : "Clear All Assignments"}
            </button>
          )}
        </div>

        {clearAllMessage && (
          <div
            className={`border rounded px-4 py-2 mt-3 text-sm ${
              clearAllMessage.startsWith("Error") ||
              clearAllMessage.startsWith("Failed")
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-green-50 border-green-200 text-green-800"
            }`}
          >
            {clearAllMessage}
          </div>
        )}

        {showResetConfirm && (
          <div className="mt-4 border border-danger rounded-lg p-4 bg-red-50">
            <p className="text-sm font-semibold text-danger mb-2">
              This will permanently delete the season, all holidays, and any generated games. Players and court schedules will be preserved.
            </p>
            <p className="text-sm text-muted mb-2">
              A full backup will be created automatically before the reset.
            </p>
            {resetStatus === "" && (
              <>
                <p className="text-sm text-muted mb-3">
                  Type <strong>DELETE</strong> to confirm:
                </p>
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="border border-border rounded px-3 py-2 text-sm w-40"
                  />
                  <button
                    onClick={handleResetSeason}
                    disabled={resetConfirmText !== "DELETE"}
                    className="bg-danger text-white px-4 py-2 rounded text-sm disabled:opacity-40 transition-colors"
                  >
                    Confirm Reset
                  </button>
                  <button
                    onClick={() => {
                      setShowResetConfirm(false);
                      setResetConfirmText("");
                    }}
                    className="text-sm text-muted hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
            {resetStatus === "backing-up" && (
              <p className="text-sm font-medium text-blue-600 mt-2">
                Creating backup...
              </p>
            )}
            {resetStatus === "resetting" && (
              <p className="text-sm font-medium text-blue-600 mt-2">
                Backup complete. Resetting season...
              </p>
            )}
            {resetStatus === "done" && (
              <div className="mt-2">
                <p className="text-sm font-medium text-green-700">
                  Season reset complete.
                </p>
                {backupResult && (
                  <p className="text-sm text-green-600 mt-1">{backupResult}</p>
                )}
              </div>
            )}
            {resetStatus === "error" && (
              <div className="mt-2">
                <p className="text-sm font-medium text-danger">{backupResult}</p>
                <button
                  onClick={() => {
                    setResetStatus("");
                    setBackupResult("");
                  }}
                  className="text-sm text-muted hover:underline mt-2"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Holidays + Generate Games */}
      {activeSeason && (
        <div className="border border-border rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Holidays &amp; Games</h2>

          {/* Holidays */}
          <div className="mb-5">
            {commonHolidays.length > 0 && (
              <div className="flex gap-3 items-end mb-3">
                <div>
                  <label className="block text-sm text-muted mb-1">
                    Quick Add
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const selected = commonHolidays.find((h) => h.date === e.target.value);
                      if (selected) {
                        setHolidayDate(selected.date);
                        setHolidayName(selected.name);
                      }
                    }}
                    className="border border-border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select a holiday...</option>
                    {commonHolidays.map((h) => (
                      <option key={h.date} value={h.date}>
                        {h.name} &mdash; {new Date(h.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="flex gap-3 items-end mb-3">
              <div>
                <label className="block text-sm text-muted mb-1">
                  Holiday Date
                </label>
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="border border-border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="e.g. Memorial Day"
                  className="border border-border rounded px-3 py-2 text-sm w-44"
                />
              </div>
              <button
                onClick={handleAddHoliday}
                title="Adds this date as a holiday. Games on holidays are marked and skipped during assignment. You can also toggle holidays directly from the Schedule page."
                className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
              >
                Add Holiday
              </button>
            </div>
            {holidays.length === 0 ? (
              <p className="text-sm text-muted">No holidays added yet.</p>
            ) : (
              <ul className="space-y-1">
                {holidays
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between text-sm border-b border-border py-1.5"
                    >
                      <span>
                        {new Date(h.date + "T00:00:00").toLocaleDateString(
                          "en-US",
                          { weekday: "short", month: "short", day: "numeric", year: "numeric" }
                        )}
                        {h.name && (
                          <span className="text-amber-700 ml-2">&mdash; {h.name}</span>
                        )}
                      </span>
                      <button
                        onClick={() => handleRemoveHoliday(h.id)}
                        title="Removes this holiday. Regenerate games or toggle from the Schedule page to update game statuses."
                        className="text-danger text-xs hover:underline"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* Generate Games */}
          <div className="border-t border-border pt-4">
            <p className="text-sm text-muted mb-3">
              {totalGames > 0
                ? `${totalGames} games currently exist. Regenerating will delete all existing games and player assignments.`
                : "Creates a game slot for every court schedule entry for each of the 36 weeks. Holiday dates are automatically marked."
              }
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              title={
                totalGames > 0
                  ? "Deletes all existing games and recreates them from the current court schedule and season dates. Player assignments will be lost."
                  : "Creates a game slot for every court schedule entry for each of the 36 weeks. Holiday dates are automatically marked."
              }
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {generating
                ? "Generating..."
                : totalGames > 0
                  ? "Regenerate Games"
                  : "Generate Games"}
            </button>

            {confirmGenerate && (
              <div className="bg-amber-50 border border-amber-300 rounded px-4 py-3 mt-3 text-sm flex items-center justify-between">
                <span className="text-amber-800">
                  This will delete all {totalGames} existing games and any player assignments. Are you sure?
                </span>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={handleGenerate}
                    className="bg-danger text-white px-3 py-1 rounded text-sm hover:opacity-90"
                  >
                    Yes, regenerate
                  </button>
                  <button
                    onClick={() => setConfirmGenerate(false)}
                    className="border border-border px-3 py-1 rounded text-sm hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {generateMessage && (
              <div className={`border rounded px-4 py-2 mt-3 text-sm ${
                generateMessage.startsWith("Error") || generateMessage.startsWith("Failed")
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-green-50 border-green-200 text-green-800"
              }`}>
                {generateMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Solo Games: Auto-Assign + Balance Balls */}
      {activeSeason && totalGames > 0 && (
        <div className="border border-border rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Solo Games</h2>
          <p className="text-sm text-muted mb-3">
            Assign solo game slots for all 36 weeks and balance ball-bringing duty.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSoloAssign}
              disabled={soloAssigning}
              title="Assigns players to all solo game slots for all 36 weeks based on solo share levels and pair settings. Best used on a fresh season."
              className="bg-orange-500 text-white px-4 py-2 rounded text-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {soloAssigning ? "Assigning..." : "Auto-Assign Solo"}
            </button>
            <button
              onClick={handleBalanceSoloBalls}
              disabled={soloBallsBalancing}
              title="Redistributes ball-bringing duty across all solo games for the entire season so each player brings balls for about 1/4 of their games."
              className="bg-orange-500 text-white px-4 py-2 rounded text-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {soloBallsBalancing ? "Balancing..." : "Balance Solo Balls"}
            </button>
            <button
              onClick={handleClearSoloAssign}
              disabled={soloAssigning}
              title="Removes all solo player assignments for the entire season. Don's assignments are not affected."
              className="border border-danger text-danger px-4 py-2 rounded text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Clear Solo Assignments
            </button>
          </div>

          {soloAssignMessage && (
            <div
              className={`border rounded px-4 py-2 mt-3 text-sm ${
                soloAssignMessage.startsWith("Error") ||
                soloAssignMessage.startsWith("Failed")
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-green-50 border-green-200 text-green-800"
              }`}
            >
              {soloAssignMessage}
            </div>
          )}

          {soloAssignLog.length > 0 && (
            <div className="mt-3 max-h-48 overflow-y-auto border border-amber-200 bg-amber-50 rounded p-3">
              <div className="text-xs font-semibold text-amber-800 mb-1">
                Log:
              </div>
              {soloAssignLog.map((entry, idx) => (
                <div
                  key={idx}
                  className={`text-xs ${
                    entry.type === "warning"
                      ? "text-amber-700"
                      : entry.type === "error"
                        ? "text-red-700"
                        : "text-green-700"
                  }`}
                >
                  {entry.week ? `Week ${entry.week}: ` : ""}
                  {entry.message}
                </div>
              ))}
            </div>
          )}

          {soloBallsMessage && (
            <div
              className={`border rounded px-4 py-2 mt-3 text-sm ${
                soloBallsMessage.startsWith("Error") ||
                soloBallsMessage.startsWith("Failed")
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-green-50 border-green-200 text-green-800"
              }`}
            >
              {soloBallsMessage}
            </div>
          )}

          {soloBallsSummary && soloBallsSummary.length > 0 && (
            <div className="mt-3 border border-border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 border-b border-border">Player</th>
                    <th className="text-right px-3 py-2 border-b border-border">Games</th>
                    <th className="text-right px-3 py-2 border-b border-border">Expected</th>
                    <th className="text-right px-3 py-2 border-b border-border">Balls</th>
                    <th className="text-right px-3 py-2 border-b border-border">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {soloBallsSummary.map((row) => {
                    const diff = row.ballsBrought - row.expected;
                    return (
                      <tr key={row.playerId} className="border-b border-border">
                        <td className="px-3 py-1.5">{playerNameMap.get(row.playerId) ?? `Player #${row.playerId}`}</td>
                        <td className="text-right px-3 py-1.5">{row.totalGames}</td>
                        <td className="text-right px-3 py-1.5">{row.expected}</td>
                        <td className="text-right px-3 py-1.5 font-medium">{row.ballsBrought}</td>
                        <td className={`text-right px-3 py-1.5 font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-amber-600" : "text-green-600"}`}>
                          {diff > 0 ? `+${diff}` : diff}
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

      {/* Balance Don's Balls */}
      {activeSeason && totalGames > 0 && (
        <div className="border border-border rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Balance Don&apos;s Balls</h2>
          <p className="text-sm text-muted mb-3">
            Balances ball-bringing duty across all Don&apos;s games for the entire season.
            Each player brings balls for approximately &frac14; of their games. Works with partial assignments.
          </p>
          <button
            onClick={handleBalanceDonsBalls}
            disabled={donsBallsBalancing}
            title="Redistributes ball-bringing duty across all Don's games for the entire season so each player brings balls for about 1/4 of their games. Works even with partial assignments."
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {donsBallsBalancing ? "Balancing..." : "Balance Don\u2019s Balls"}
          </button>

          {donsBallsMessage && (
            <div
              className={`border rounded px-4 py-2 mt-3 text-sm ${
                donsBallsMessage.startsWith("Error") ||
                donsBallsMessage.startsWith("Failed")
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-green-50 border-green-200 text-green-800"
              }`}
            >
              {donsBallsMessage}
            </div>
          )}

          {donsBallsSummary && donsBallsSummary.length > 0 && (
            <div className="mt-3 border border-border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 border-b border-border">Player</th>
                    <th className="text-right px-3 py-2 border-b border-border">Games</th>
                    <th className="text-right px-3 py-2 border-b border-border">Expected</th>
                    <th className="text-right px-3 py-2 border-b border-border">Balls</th>
                    <th className="text-right px-3 py-2 border-b border-border">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {donsBallsSummary.map((row) => {
                    const diff = row.ballsBrought - row.expected;
                    return (
                      <tr key={row.playerId} className="border-b border-border">
                        <td className="px-3 py-1.5">{playerNameMap.get(row.playerId) ?? `Player #${row.playerId}`}</td>
                        <td className="text-right px-3 py-1.5">{row.totalGames}</td>
                        <td className="text-right px-3 py-1.5">{row.expected}</td>
                        <td className="text-right px-3 py-1.5 font-medium">{row.ballsBrought}</td>
                        <td className={`text-right px-3 py-1.5 font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-amber-600" : "text-green-600"}`}>
                          {diff > 0 ? `+${diff}` : diff}
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
    </div>
  );
}
