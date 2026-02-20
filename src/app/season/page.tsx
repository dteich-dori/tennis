"use client";

import { useState, useEffect, useCallback } from "react";

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
}

export default function SeasonPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [startDate, setStartDate] = useState("");
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayDate, setHolidayDate] = useState("");
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
      body: JSON.stringify({ seasonId: activeSeason.id, date: holidayDate }),
    });
    setHolidayDate("");
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
        `Backup saved to backups/${backupData.folder}/ (${backupData.counts?.players ?? 0} players, ${backupData.counts?.courtSchedules ?? 0} courts, ${backupData.counts?.games ?? 0} games)`
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

  const endDateDisplay = startDate && validateMonday(startDate)
    ? (() => {
        const d = new Date(startDate + "T00:00:00");
        d.setDate(d.getDate() + 36 * 7 - 1);
        return d.toISOString().split("T")[0];
      })()
    : "";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Season Setup</h1>

      {/* Season Dates */}
      <div className="border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-4">Season Dates</h2>
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
        <div className="flex gap-3 items-center">
          <button
            onClick={handleSaveSeason}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
          >
            {activeSeason ? "Update Season" : "Create Season"}
          </button>
          {activeSeason && !showResetConfirm && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="border border-danger text-danger px-4 py-2 rounded text-sm hover:bg-red-50 transition-colors"
            >
              Reset Season
            </button>
          )}
        </div>
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

      {/* Regenerate Games */}
      {activeSeason && (
        <div className="border border-border rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Generate Games</h2>
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
      )}

      {/* Derated Player Settings */}
      {activeSeason && (
        <div className="border border-border rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Derated Player Settings</h2>
          <p className="text-sm text-muted mb-3">
            Limit how often a player can be paired with the <strong>same</strong> derated player.
            Derated players are those with health or mobility issues.
          </p>
          <div className="flex gap-4 items-end">
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
          <p className="text-xs text-muted mt-2">
            This setting is saved when you click &quot;Update Season&quot; above.
          </p>
        </div>
      )}

      {/* Holidays */}
      {activeSeason && (
        <div className="border border-border rounded-lg p-6">
          <h2 className="font-semibold mb-4">Holidays</h2>
          <div className="flex gap-3 items-end mb-4">
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
            <button
              onClick={handleAddHoliday}
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
            >
              Add Holiday
            </button>
          </div>
          {holidays.length === 0 ? (
            <p className="text-sm text-muted">No holidays added yet.</p>
          ) : (
            <ul className="space-y-2">
              {holidays
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between text-sm border-b border-border py-2"
                  >
                    <span>
                      {new Date(h.date + "T00:00:00").toLocaleDateString(
                        "en-US",
                        { weekday: "short", month: "short", day: "numeric", year: "numeric" }
                      )}
                    </span>
                    <button
                      onClick={() => handleRemoveHoliday(h.id)}
                      className="text-danger text-xs hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
