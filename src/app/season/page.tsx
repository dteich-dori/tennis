"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";


interface Season {
  id: number;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  maxDeratedPerWeek: number | null;
  maxCGamesPerWeek: number | null;
  maxCGamesPerWeek1x: number | null;
  maxACGamesPerSeason: number | null;
}

interface Holiday {
  id: number;
  seasonId: number;
  date: string;
  name: string;
}

interface CourtSlot {
  id: number;
  seasonId: number;
  dayOfWeek: number;
  courtNumber: number;
  startTime: string;
  isSolo: boolean;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SeasonPage() {
  const [activeTab, setActiveTab] = useState<"current" | "new">("current");
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [startDate, setStartDate] = useState("");
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [error, setError] = useState("");
  const [showCourtWizard, setShowCourtWizard] = useState(false);
  const [courtWizardStep, setCourtWizardStep] = useState<1 | 2>(1);
  const [rebuildConfirmText, setRebuildConfirmText] = useState("");
  const [rebuildStatus, setRebuildStatus] = useState<"" | "backing-up" | "rebuilding" | "done" | "error">("");
  const [backupResult, setBackupResult] = useState("");
  const [courtSlots, setCourtSlots] = useState<CourtSlot[]>([]);
  const [editingSlot, setEditingSlot] = useState<CourtSlot | null>(null);
  const [courtForm, setCourtForm] = useState({ dayOfWeek: "1", courtNumber: "3", startTime: "10:30", isSolo: false });
  const [maxDeratedPerWeek, setMaxDeratedPerWeek] = useState<string>("none");
  const [maxCGamesPerWeek, setMaxCGamesPerWeek] = useState<string>("1");
  const [maxCGamesPerWeek1x, setMaxCGamesPerWeek1x] = useState<string>("4");
  const [maxACGamesPerSeason, setMaxACGamesPerSeason] = useState<string>("1");

  // Regenerate games state
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState("");
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [totalGames, setTotalGames] = useState(0);

  // Add makeup week state
  const [addingWeek, setAddingWeek] = useState(false);
  const [addWeekMessage, setAddWeekMessage] = useState("");

  // Don's auto-assign all state
  const [donsAssigning, setDonsAssigning] = useState(false);
  const [donsAssigningWeek, setDonsAssigningWeek] = useState<number | null>(null);
  const donsStopRef = useRef(false);
  const [donsAssignMessage, setDonsAssignMessage] = useState("");
  const [donsAssignLog, setDonsAssignLog] = useState<
    { type: string; week?: number; message: string }[]
  >([]);
  const [donsAssignExtra, setDonsAssignExtra] = useState(false);
  const [donsAssignCSubs, setDonsAssignCSubs] = useState(false);
  const [donsAssignStdCatchup, setDonsAssignStdCatchup] = useState(true);

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

  // Don's pairings balance state
  const [donsPairingsBalancing, setDonsPairingsBalancing] = useState(false);
  const [donsPairingsMessage, setDonsPairingsMessage] = useState("");

  // Download backup state
  const [backupDownloading, setBackupDownloading] = useState(false);
  const [backupDownloadMessage, setBackupDownloadMessage] = useState("");

  // Backup directory settings state
  const [backupDir, setBackupDir] = useState("Backup");
  const [backupDirSaving, setBackupDirSaving] = useState(false);
  const [backupDirMessage, setBackupDirMessage] = useState("");

  // Weekly game summary
  const [weeklyContractsSold, setWeeklyContractsSold] = useState<number | null>(null);
  const [weeklyGamesNeeded, setWeeklyGamesNeeded] = useState<number | null>(null);
  const [weeklyGamesAvailable, setWeeklyGamesAvailable] = useState<number | null>(null);

  const loadSeasons = useCallback(async () => {
    const res = await fetch("/api/seasons");
    const data = (await res.json()) as Season[];
    setSeasons(data);
    if (data.length > 0) {
      const latest = data[data.length - 1];
      setActiveSeason(latest);
      setStartDate(latest.startDate);
      setMaxDeratedPerWeek(latest.maxDeratedPerWeek != null ? String(latest.maxDeratedPerWeek) : "none");
      setMaxCGamesPerWeek(latest.maxCGamesPerWeek != null ? String(latest.maxCGamesPerWeek) : "none");
      setMaxCGamesPerWeek1x(latest.maxCGamesPerWeek1x != null ? String(latest.maxCGamesPerWeek1x) : "none");
      setMaxACGamesPerSeason(latest.maxACGamesPerSeason != null ? String(latest.maxACGamesPerSeason) : "none");
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

  const loadWeeklyGameSummary = useCallback(async (seasonId: number) => {
    try {
      const [playersRes, courtsRes] = await Promise.all([
        fetch(`/api/players?seasonId=${seasonId}`),
        fetch(`/api/courts?seasonId=${seasonId}`),
      ]);
      const players = (await playersRes.json()) as { isActive: boolean; contractedFrequency: string }[];
      const courts = (await courtsRes.json()) as { isSolo: boolean }[];

      // Sum contracted frequencies for active non-sub players (2+ counts as 2)
      const totalPlayerSlots = players
        .filter((p) => p.isActive && p.contractedFrequency !== "0")
        .reduce((sum, p) => {
          const freq = p.contractedFrequency === "2+" ? 2 : parseInt(p.contractedFrequency) || 0;
          return sum + freq;
        }, 0);
      setWeeklyContractsSold(totalPlayerSlots);
      setWeeklyGamesNeeded(parseFloat((totalPlayerSlots / 4).toFixed(1)));

      // Count non-solo court slots
      const donsSlots = courts.filter((c) => !c.isSolo).length;
      setWeeklyGamesAvailable(donsSlots);
    } catch (err) {
      console.error("Failed to load weekly game summary:", err);
    }
  }, []);

  const loadAppSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/app-settings");
      const data = (await res.json()) as { backupDir?: string };
      if (data.backupDir) setBackupDir(data.backupDir);
    } catch (err) {
      console.error("Failed to load app settings:", err);
    }
  }, []);

  useEffect(() => {
    loadSeasons();
    loadAppSettings();
  }, [loadSeasons, loadAppSettings]);

  useEffect(() => {
    if (activeSeason) {
      loadHolidays(activeSeason.id);
      loadGamesCount(activeSeason.id);
      loadWeeklyGameSummary(activeSeason.id);
    }
  }, [activeSeason, loadHolidays, loadGamesCount, loadWeeklyGameSummary]);

  // Auto-save derated pairing frequency when changed
  const deratedInitialized = useRef(false);
  useEffect(() => {
    if (!activeSeason) return;
    if (!deratedInitialized.current) {
      deratedInitialized.current = true;
      return;
    }
    const deratedValue = maxDeratedPerWeek === "none" ? null : parseInt(maxDeratedPerWeek);
    fetch("/api/seasons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeSeason.id, startDate: activeSeason.startDate, maxDeratedPerWeek: deratedValue }),
    });
  }, [maxDeratedPerWeek, activeSeason]);

  // Auto-save C games per week setting when changed
  const cGamesInitialized = useRef(false);
  useEffect(() => {
    if (!activeSeason) return;
    if (!cGamesInitialized.current) {
      cGamesInitialized.current = true;
      return;
    }
    const cGamesValue = maxCGamesPerWeek === "none" ? null : parseInt(maxCGamesPerWeek);
    fetch("/api/seasons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeSeason.id, startDate: activeSeason.startDate, maxCGamesPerWeek: cGamesValue }),
    });
  }, [maxCGamesPerWeek, activeSeason]);

  // Auto-save 1x C games frequency setting when changed
  const cGames1xInitialized = useRef(false);
  useEffect(() => {
    if (!activeSeason) return;
    if (!cGames1xInitialized.current) {
      cGames1xInitialized.current = true;
      return;
    }
    const cGamesValue = maxCGamesPerWeek1x === "none" ? null : parseInt(maxCGamesPerWeek1x);
    fetch("/api/seasons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeSeason.id, startDate: activeSeason.startDate, maxCGamesPerWeek1x: cGamesValue }),
    });
  }, [maxCGamesPerWeek1x, activeSeason]);

  // Auto-save A+C games per season setting
  const acSeasonInitialized = useRef(false);
  useEffect(() => {
    if (!activeSeason) return;
    if (!acSeasonInitialized.current) {
      acSeasonInitialized.current = true;
      return;
    }
    const val = maxACGamesPerSeason === "none" ? null : parseInt(maxACGamesPerSeason);
    fetch("/api/seasons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeSeason.id, startDate: activeSeason.startDate, maxACGamesPerSeason: val }),
    });
  }, [maxACGamesPerSeason, activeSeason]);

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

  const handleAddWeek = async () => {
    if (!activeSeason) return;
    const nextWeek = (activeSeason.totalWeeks ?? 36) + 1;
    if (!window.confirm(`Add makeup week ${nextWeek} to the season?`)) return;

    setAddingWeek(true);
    setAddWeekMessage("");

    try {
      const res = await fetch("/api/games/add-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: activeSeason.id }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        weekNumber?: number;
        gamesAdded?: number;
        newEndDate?: string;
        error?: string;
      };

      if (data.success) {
        setAddWeekMessage(`Week ${data.weekNumber} added with ${data.gamesAdded} game slots.`);
        // Reload season to reflect new totalWeeks and endDate
        await loadSeasons();
        await loadGamesCount(activeSeason.id);
      } else {
        setAddWeekMessage(`Error: ${data.error}`);
      }
    } catch {
      setAddWeekMessage("Failed to add makeup week");
    }

    setAddingWeek(false);
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

  // Save a backup of all database tables to Backup/ directory
  const downloadBackup = async (): Promise<string | false> => {
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const data = (await res.json()) as {
        success?: boolean;
        tables?: Record<string, string>;
        backupFolder?: string;
        counts?: { players: number; courtSchedules: number; games: number; assignments: number };
        error?: string;
      };
      if (!res.ok || !data.success || !data.tables) {
        return false;
      }

      return data.backupFolder ?? "Backup";
    } catch {
      return false;
    }
  };

  const handleDownloadBackup = async () => {
    setBackupDownloading(true);
    setBackupDownloadMessage("");
    const result = await downloadBackup();
    setBackupDownloadMessage(
      result ? `Backup saved to ${backupDir}/${result}/` : "Backup failed."
    );
    setBackupDownloading(false);
    if (result) {
      setTimeout(() => setBackupDownloadMessage(""), 5000);
    }
  };

  const handleSaveBackupDir = async () => {
    setBackupDirSaving(true);
    setBackupDirMessage("");
    try {
      const res = await fetch("/api/app-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupDir }),
      });
      const data = (await res.json()) as { backupDir?: string; error?: string };
      if (!res.ok) {
        setBackupDirMessage(`Error: ${data.error}`);
      } else {
        setBackupDirMessage("Backup directory saved.");
        setTimeout(() => setBackupDirMessage(""), 3000);
      }
    } catch {
      setBackupDirMessage("Failed to save backup directory.");
    }
    setBackupDirSaving(false);
  };

  const loadCourtSlots = async () => {
    if (!activeSeason) return;
    const res = await fetch(`/api/courts?seasonId=${activeSeason.id}`);
    const data = await res.json();
    setCourtSlots(data);
  };

  const handleAddCourtSlot = async () => {
    if (!activeSeason) return;
    await fetch("/api/courts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId: activeSeason.id,
        dayOfWeek: parseInt(courtForm.dayOfWeek),
        courtNumber: parseInt(courtForm.courtNumber),
        startTime: courtForm.startTime,
        isSolo: courtForm.isSolo,
      }),
    });
    await loadCourtSlots();
    setCourtForm({ dayOfWeek: "1", courtNumber: "3", startTime: "10:30", isSolo: false });
  };

  const handleUpdateCourtSlot = async () => {
    if (!activeSeason || !editingSlot) return;
    await fetch("/api/courts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingSlot.id,
        seasonId: activeSeason.id,
        dayOfWeek: parseInt(courtForm.dayOfWeek),
        courtNumber: parseInt(courtForm.courtNumber),
        startTime: courtForm.startTime,
        isSolo: courtForm.isSolo,
      }),
    });
    setEditingSlot(null);
    await loadCourtSlots();
    setCourtForm({ dayOfWeek: "1", courtNumber: "3", startTime: "10:30", isSolo: false });
  };

  const handleDeleteCourtSlot = async (id: number) => {
    await fetch(`/api/courts?id=${id}`, { method: "DELETE" });
    await loadCourtSlots();
  };

  const handleRebuildGames = async () => {
    if (!activeSeason || rebuildConfirmText !== "REBUILD") return;

    // Step 1: Backup
    setRebuildStatus("backing-up");
    setBackupResult("");
    const result = await downloadBackup();
    if (!result) {
      setRebuildStatus("error");
      setBackupResult("Backup failed. Rebuild cancelled.");
      return;
    }
    setBackupResult(`Backup saved to ${backupDir}/${result}/`);

    // Step 2: Regenerate games
    setRebuildStatus("rebuilding");
    let failed = false;
    try {
      const res = await fetch("/api/games/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: activeSeason.id }),
      });
      const data = (await res.json()) as { success?: boolean; gamesGenerated?: number; error?: string };
      if (data.success) {
        await loadGamesCount(activeSeason.id);
        setRebuildStatus("done");
        setBackupResult((prev) => `${prev} Regenerated ${data.gamesGenerated} games.`);
      } else {
        failed = true;
        setRebuildStatus("error");
        setBackupResult(`Rebuild failed: ${data.error}`);
      }
    } catch {
      failed = true;
      setRebuildStatus("error");
      setBackupResult("Failed to regenerate games.");
    }

    // Auto-close after 3 seconds on success
    if (!failed) {
      setTimeout(() => {
        setShowCourtWizard(false);
        setCourtWizardStep(1);
        setRebuildConfirmText("");
        setRebuildStatus("");
        setBackupResult("");
      }, 3000);
    }
  };

  const handleDonsAssignAll = async () => {
    if (!activeSeason) return;
    donsStopRef.current = false;
    setDonsAssigning(true);
    setDonsAssigningWeek(null);
    setDonsAssignMessage("");
    setDonsAssignLog([]);

    try {
      // First, determine which weeks need assignment by calling the info endpoint
      const infoRes = await fetch("/api/games/auto-assign-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: activeSeason.id, infoOnly: true }),
      });
      const infoData = (await infoRes.json()) as {
        weeksToAssign?: number[];
        weeksSkipped?: number[];
        error?: string;
        log?: { type: string; week?: number; message: string }[];
      };

      if (!infoRes.ok || !infoData.weeksToAssign) {
        // Fall back to the old behavior
        setDonsAssignMessage(`Error: ${infoData.error ?? "Failed to get week info"}`);
        if (infoData.log) setDonsAssignLog(infoData.log);
        setDonsAssigning(false);
        return;
      }

      const weeksToAssign = infoData.weeksToAssign;
      const weeksSkipped = infoData.weeksSkipped ?? [];
      const log: { type: string; week?: number; message: string }[] = [];

      if (weeksSkipped.length > 0) {
        log.push({ type: "info", message: `Skipping ${weeksSkipped.length} week(s) with existing assignments: ${weeksSkipped.join(", ")}` });
        setDonsAssignLog([...log]);
      }

      if (weeksToAssign.length === 0) {
        setDonsAssignMessage("All weeks already have Don's assignments. Nothing to do.");
        setDonsAssignLog(log);
        setDonsAssigning(false);
        return;
      }

      let totalAssigned = 0;
      let totalSlots = 0;
      let totalUnfilled = 0;
      let weeksAssignedCount = 0;
      for (const week of weeksToAssign) {
        if (donsStopRef.current) {
          log.push({ type: "warning", message: "Stopped by user." });
          setDonsAssignLog([...log]);
          break;
        }
        setDonsAssigningWeek(week);

        try {
          const res = await fetch("/api/games/auto-assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seasonId: activeSeason.id, weekNumber: week, assignExtra: donsAssignExtra, assignCSubs: donsAssignCSubs }),
          });
          const data = await res.json();

          if (!res.ok) {
            log.push({ type: "error", week, message: `Week ${week}: ${data.error || "Failed"}` });
            if (data.error?.includes("Solo games must be fully assigned")) {
              log.push({ type: "error", message: "Stopping: Solo games must be fully assigned before Don's auto-assign." });
              donsStopRef.current = true;
            }
          } else {
            const filled = data.assignedCount ?? 0;
            const slots = data.totalSlots ?? 0;
            const unfilled = data.unfilled ?? 0;
            totalAssigned += filled;
            totalSlots += slots;
            totalUnfilled += unfilled;
            weeksAssignedCount++;
            // Find the last pass used from the API log
            const completionEntry = data.log?.find((e: { message: string }) => e.message.startsWith("Complete:"));
            const lastPassMatch = completionEntry?.message.match(/Last pass used: (.+)\./);
            const lastPassInfo = lastPassMatch ? ` — ${lastPassMatch[1]}` : "";
            log.push({ type: unfilled > 0 ? "warning" : "info", week, message: `${filled}/${slots} slots filled${unfilled > 0 ? ` (${unfilled} unfilled)` : ""}${lastPassInfo}` });
            if (data.log) {
              for (const entry of data.log) {
                if (entry.type === "warning" || entry.type === "error") {
                  log.push({ type: entry.type, week, message: `  ${entry.message}` });
                }
              }
            }
          }
        } catch (err) {
          log.push({ type: "error", week, message: `Week ${week}: ${String(err)}` });
        }

        setDonsAssignLog([...log]);
        setDonsAssignMessage(`Assigned ${weeksAssignedCount} of ${weeksToAssign.length} week(s)...`);
      }

      // STD catchup second pass: re-run weeks with unfilled slots now that all weeks are assigned
      if (donsAssignStdCatchup && totalUnfilled > 0 && !donsStopRef.current) {
        log.push({ type: "info", message: "--- STD Catchup Pass: re-running weeks with unfilled slots ---" });
        setDonsAssignLog([...log]);

        for (const week of weeksToAssign) {
          if (donsStopRef.current) {
            log.push({ type: "warning", message: "Stopped by user." });
            setDonsAssignLog([...log]);
            break;
          }
          setDonsAssigningWeek(week);
          try {
            const res = await fetch("/api/games/auto-assign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ seasonId: activeSeason.id, weekNumber: week, assignExtra: donsAssignExtra, assignCSubs: donsAssignCSubs, assignStdCatchup: true }),
            });
            const data = await res.json();
            if (res.ok) {
              const filled = data.assignedCount ?? 0;
              if (filled > 0) {
                totalAssigned += filled;
                totalUnfilled -= filled;
                const completionEntry = data.log?.find((e: { message: string }) => e.message.startsWith("Complete:"));
                const lastPassMatch = completionEntry?.message.match(/Last pass used: (.+)\./);
                const lastPassInfo = lastPassMatch ? ` — ${lastPassMatch[1]}` : "";
                log.push({ type: "info", week, message: `${filled} additional slots filled${lastPassInfo}` });
              }
              if (data.log) {
                for (const entry of data.log) {
                  if (entry.type === "warning" || entry.type === "error") {
                    log.push({ type: entry.type, week, message: `  ${entry.message}` });
                  }
                }
              }
            }
          } catch (err) {
            log.push({ type: "error", week, message: `STD catchup Week ${week}: ${String(err)}` });
          }
          setDonsAssignLog([...log]);
        }
      }

      // Balance Pairings: swap same-level players between same-day games to reduce pairing concentrations
      if (!donsStopRef.current && weeksAssignedCount > 0) {
        log.push({ type: "info", message: "--- Balance Pairings: reducing pairing concentrations ---" });
        setDonsAssignLog([...log]);
        setDonsAssigningWeek(null);
        try {
          const bpRes = await fetch("/api/games/balance-pairings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seasonId: activeSeason.id }),
          });
          const bpData = await bpRes.json();
          if (bpRes.ok) {
            log.push({
              type: "info",
              message: `Balance Pairings: ${bpData.swaps} swaps, imbalance ${Math.round(bpData.imbalanceBefore)} → ${Math.round(bpData.imbalanceAfter)}`,
            });
          } else {
            log.push({ type: "error", message: `Balance Pairings failed: ${bpData.error ?? "unknown error"}` });
          }
        } catch (err) {
          log.push({ type: "error", message: `Balance Pairings: ${String(err)}` });
        }

        // Balance Don's Balls
        if (!donsStopRef.current) {
          log.push({ type: "info", message: "--- Balance Balls: redistributing ball-bringing duty ---" });
          setDonsAssignLog([...log]);
          try {
            const bbRes = await fetch("/api/games/balance-balls", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ seasonId: activeSeason.id, group: "dons", allWeeks: true }),
            });
            const bbData = await bbRes.json();
            if (bbRes.ok) {
              log.push({
                type: "info",
                message: `Balance Balls: ${bbData.swaps ?? 0} swaps, imbalance score ${bbData.imbalance ?? 0}`,
              });
            } else {
              log.push({ type: "error", message: `Balance Balls failed: ${bbData.error ?? "unknown error"}` });
            }
          } catch (err) {
            log.push({ type: "error", message: `Balance Balls: ${String(err)}` });
          }
        }
      }

      setDonsAssigningWeek(null);
      setDonsAssignMessage(
        `Assigned ${weeksAssignedCount} week(s): ${totalAssigned} of ${totalSlots} slots filled.${
          weeksSkipped.length ? ` ${weeksSkipped.length} week(s) skipped.` : ""
        }${totalUnfilled > 0 ? ` ${totalUnfilled} unfilled.` : ""}`
      );
      setDonsAssignLog(log);
    } catch {
      setDonsAssignMessage("Failed to auto-assign Don's games.");
    }
    setDonsAssigning(false);
  };

  const handleClearDonsAssignAll = async () => {
    if (!activeSeason) return;
    if (!confirm("Clear ALL Don's game assignments for the entire season?")) return;
    setDonsAssigning(true);
    setDonsAssignMessage("");
    setDonsAssignLog([]);
    try {
      const res = await fetch("/api/games/auto-assign-all", {
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
        setDonsAssignMessage(`Cleared ${data.deletedCount} Don's assignments.`);
      } else {
        setDonsAssignMessage(`Error: ${data.error}`);
      }
    } catch {
      setDonsAssignMessage("Failed to clear Don's assignments.");
    }
    setDonsAssigning(false);
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

  const handleBalanceDonsPairings = async () => {
    if (!activeSeason) return;
    setDonsPairingsBalancing(true);
    setDonsPairingsMessage("");
    try {
      const res = await fetch("/api/games/balance-pairings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: activeSeason.id }),
      });
      const data = (await res.json()) as {
        swaps?: number;
        mutations?: number;
        imbalanceBefore?: number;
        imbalanceAfter?: number;
        error?: string;
      };
      if (!res.ok) {
        setDonsPairingsMessage(`Error: ${data.error}`);
      } else {
        const improvement =
          data.imbalanceBefore && data.imbalanceAfter
            ? ` Imbalance: ${data.imbalanceBefore} → ${data.imbalanceAfter}`
            : "";
        setDonsPairingsMessage(
          `Balanced pairings: ${data.swaps} swap${data.swaps !== 1 ? "s" : ""}, ${data.mutations} assignment${data.mutations !== 1 ? "s" : ""} updated.${improvement}`
        );
      }
    } catch {
      setDonsPairingsMessage("Failed to balance pairings.");
    }
    setDonsPairingsBalancing(false);
  };

  const totalWeeks = activeSeason?.totalWeeks ?? 36;

  const endDateDisplay = startDate && validateMonday(startDate)
    ? (() => {
        const d = new Date(startDate + "T00:00:00");
        d.setDate(d.getDate() + totalWeeks * 7 - 1);
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

    // Jewish holidays (Hebrew calendar — dates vary yearly, lookup table required)
    const jewishHolidayDates: Record<number, { rh1: [number, number]; rh2: [number, number]; yk: [number, number] }> = {
      2024: { rh1: [9, 3],  rh2: [9, 4],  yk: [9, 12] },
      2025: { rh1: [8, 23], rh2: [8, 24], yk: [9, 2] },
      2026: { rh1: [8, 12], rh2: [8, 13], yk: [8, 21] },
      2027: { rh1: [9, 2],  rh2: [9, 3],  yk: [9, 11] },
      2028: { rh1: [8, 21], rh2: [8, 22], yk: [8, 30] },
      2029: { rh1: [8, 10], rh2: [8, 11], yk: [8, 19] },
      2030: { rh1: [8, 28], rh2: [8, 29], yk: [9, 7] },
    };

    const all: { date: string; name: string }[] = [];

    for (const year of years) {
      const candidates: { date: Date; name: string }[] = [
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

      // Add Jewish holidays from lookup table
      const jh = jewishHolidayDates[year];
      if (jh) {
        candidates.push(
          { date: new Date(year, jh.rh1[0], jh.rh1[1]), name: "Rosh Hashana (Day 1)" },
          { date: new Date(year, jh.rh2[0], jh.rh2[1]), name: "Rosh Hashana (Day 2)" },
          { date: new Date(year, jh.yk[0], jh.yk[1]), name: "Yom Kippur" },
        );
      }

      for (const c of candidates) {
        if (c.date >= seasonStart && c.date <= seasonEnd) {
          all.push({ date: fmt(c.date), name: c.name });
        }
      }
    }

    // Sort by date and filter out holidays already added
    all.sort((a, b) => a.date.localeCompare(b.date));
    const existingDates = new Set(holidays.map((h) => h.date));
    return all.filter((h) => !existingDates.has(h.date));
  }, [startDate, endDateDisplay, holidays]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Season Setup</h1>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("current")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "current" ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Current Season
        </button>
        <button
          onClick={() => setActiveTab("new")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "new" ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          New Season
        </button>
      </div>

      {activeTab === "current" && (<>
      {/* Season Dates + Reset + Clear All */}
      <div className="border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-4">Season {activeSeason?.id}</h2>
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
        <div className="flex items-center gap-3 mb-1">
          <span className="text-sm text-muted">
            {totalWeeks}-week season{totalWeeks > 36 ? ` (${totalWeeks - 36} makeup)` : ""}
          </span>
          {totalGames > 0 && (
            <button
              onClick={handleAddWeek}
              disabled={addingWeek}
              title={`Adds week ${totalWeeks + 1} with empty game slots based on the court schedule. Use for makeups (holidays, weather closures).`}
              className="text-xs bg-orange-500 text-white px-2.5 py-1 rounded hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {addingWeek ? "Adding..." : `+ Add Makeup Week`}
            </button>
          )}
        </div>
        {addWeekMessage && (
          <div className={`border rounded px-4 py-2 mb-2 text-sm ${
            addWeekMessage.startsWith("Error") || addWeekMessage.startsWith("Failed")
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-green-50 border-green-200 text-green-800"
          }`}>
            {addWeekMessage}
          </div>
        )}
        {weeklyContractsSold !== null && weeklyGamesAvailable !== null && (
          <div className="text-sm text-muted mb-3">
            Total Don weekly contracts sold: {weeklyContractsSold} ({weeklyGamesNeeded} games) &nbsp;&nbsp; Total weekly games available (w/o Solo): {weeklyGamesAvailable}
          </div>
        )}

        {/* Derated Player Settings - highlighted box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4">
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-1">
                Same Derated Player Pairing Frequency
              </label>
              <select
                value={maxDeratedPerWeek}
                onChange={(e) => setMaxDeratedPerWeek(e.target.value)}
                className="border border-blue-300 rounded px-3 py-2 text-sm bg-white"
              >
                <option value="none">No limit</option>
                <option value="1">Once per week</option>
                <option value="2">Once per two weeks</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-1">
                C Games — 2x Players
              </label>
              <select
                value={maxCGamesPerWeek}
                onChange={(e) => setMaxCGamesPerWeek(e.target.value)}
                className="border border-blue-300 rounded px-3 py-2 text-sm bg-white"
                title="Frequency of C-player games for 2x cGamesOk players."
              >
                <option value="1">Once per week</option>
                <option value="2">Once per 2 weeks</option>
                <option value="4">Once per 4 weeks</option>
                <option value="none">No limit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-1">
                C Games — 1x Players
              </label>
              <select
                value={maxCGamesPerWeek1x}
                onChange={(e) => setMaxCGamesPerWeek1x(e.target.value)}
                className="border border-blue-300 rounded px-3 py-2 text-sm bg-white"
                title="Frequency of C-player games for 1x cGamesOk players. Value is weeks between C games (e.g., 4 = once per month)."
              >
                <option value="4">Once per 4 weeks</option>
                <option value="3">Once per 3 weeks</option>
                <option value="2">Once per 2 weeks</option>
                <option value="none">No limit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-1">
                A+C Games / Season
              </label>
              <select
                value={maxACGamesPerSeason}
                onChange={(e) => setMaxACGamesPerSeason(e.target.value)}
                className="border border-blue-300 rounded px-3 py-2 text-sm bg-white"
                title="Maximum number of A+C games per season for each cGamesOk player."
              >
                <option value="1">1 per season</option>
                <option value="2">2 per season</option>
                <option value="3">3 per season</option>
                <option value="none">No limit</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {!activeSeason && (
            <button
              onClick={handleSaveSeason}
              title="Creates a new season with the specified start date and settings"
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
            >
              Create Season
            </button>
          )}
          {activeSeason && (
            <button
              onClick={handleDownloadBackup}
              disabled={backupDownloading}
              title="Downloads a ZIP file containing CSV backups of all database tables"
              className="border-2 border-primary text-primary px-4 py-2 rounded text-sm hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              {backupDownloading ? "Downloading..." : "Download Backup"}
            </button>
          )}
          {activeSeason && (
            <button
              onClick={() => {
                if (!confirm("This will open the court schedule editor. If you rebuild games, all existing assignments will be cleared.\n\nProceed?")) return;
                setShowCourtWizard(true);
                setCourtWizardStep(1);
                setRebuildConfirmText("");
                setRebuildStatus("");
                setBackupResult("");
                loadCourtSlots();
              }}
              title="Edit the court schedule and regenerate games. WARNING: Rebuilding clears all assignments. A backup is created automatically."
              className="border border-amber-500 text-amber-700 px-4 py-2 rounded text-sm hover:bg-amber-50 transition-colors"
            >
              ⚠ Change Court Schedule
            </button>
          )}
        </div>

        {backupDownloadMessage && (
          <div
            className={`border rounded px-4 py-2 mt-3 text-sm ${
              backupDownloadMessage.includes("failed")
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-green-50 border-green-200 text-green-800"
            }`}
          >
            {backupDownloadMessage}
          </div>
        )}

        {/* Court Schedule Wizard Modal */}
        {showCourtWizard && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              {/* Step 1: Court Schedule Editor */}
              {courtWizardStep === 1 && (
                <div className="p-6">
                  <h2 className="text-lg font-semibold mb-4">Court Schedule</h2>

                  {/* Add/Edit Form */}
                  <div className="bg-gray-50 border border-border rounded-lg p-4 mb-4">
                    <div className="flex flex-wrap gap-3 items-end">
                      <div>
                        <label className="block text-xs text-muted mb-1">Day</label>
                        <select
                          value={courtForm.dayOfWeek}
                          onChange={(e) => setCourtForm({ ...courtForm, dayOfWeek: e.target.value })}
                          className="border border-border rounded px-3 py-2 text-sm"
                        >
                          <option value="1">Mon</option>
                          <option value="2">Tue</option>
                          <option value="3">Wed</option>
                          <option value="4">Thu</option>
                          <option value="5">Fri</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">Court #</label>
                        <select
                          value={courtForm.courtNumber}
                          onChange={(e) => setCourtForm({ ...courtForm, courtNumber: e.target.value })}
                          className="border border-border rounded px-3 py-2 text-sm"
                        >
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={String(n)}>{n}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">Start Time</label>
                        <input
                          type="time"
                          value={courtForm.startTime}
                          onChange={(e) => setCourtForm({ ...courtForm, startTime: e.target.value })}
                          className="border border-border rounded px-3 py-2 text-sm"
                        />
                      </div>
                      <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={courtForm.isSolo}
                          onChange={(e) => setCourtForm({ ...courtForm, isSolo: e.target.checked })}
                          className="accent-indigo-500"
                        />
                        Solo
                      </label>
                      <button
                        onClick={() => {
                          if (editingSlot) {
                            handleUpdateCourtSlot();
                          } else {
                            handleAddCourtSlot();
                          }
                        }}
                        className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
                      >
                        {editingSlot ? "Save" : "Add"}
                      </button>
                      {editingSlot && (
                        <button
                          onClick={() => {
                            setEditingSlot(null);
                            setCourtForm({ dayOfWeek: "1", courtNumber: "3", startTime: "10:30", isSolo: false });
                          }}
                          className="text-sm text-muted hover:underline"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Court Slots Table */}
                  {courtSlots.length === 0 ? (
                    <p className="text-sm text-muted mb-4">No court slots configured.</p>
                  ) : (
                    <div className="border border-border rounded overflow-hidden mb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left px-3 py-2 border-b border-border">Day</th>
                            <th className="text-left px-3 py-2 border-b border-border">Court #</th>
                            <th className="text-left px-3 py-2 border-b border-border">Time</th>
                            <th className="text-left px-3 py-2 border-b border-border">Group</th>
                            <th className="text-right px-3 py-2 border-b border-border"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...courtSlots]
                            .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime) || a.courtNumber - b.courtNumber)
                            .map((slot) => (
                              <tr key={slot.id} className="border-b border-border hover:bg-gray-50">
                                <td className="px-3 py-1.5">{DAY_NAMES[slot.dayOfWeek]}</td>
                                <td className="px-3 py-1.5">{slot.courtNumber}</td>
                                <td className="px-3 py-1.5">{slot.startTime}</td>
                                <td className="px-3 py-1.5">{slot.isSolo ? "Solo" : "Don\u2019s"}</td>
                                <td className="px-3 py-1.5 text-right">
                                  <button
                                    onClick={() => {
                                      setEditingSlot(slot);
                                      setCourtForm({
                                        dayOfWeek: String(slot.dayOfWeek),
                                        courtNumber: String(slot.courtNumber),
                                        startTime: slot.startTime,
                                        isSolo: slot.isSolo,
                                      });
                                    }}
                                    className="text-indigo-600 text-xs hover:underline mr-3"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCourtSlot(slot.id)}
                                    className="text-danger text-xs hover:underline"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Step 1 Buttons */}
                  <div className="flex justify-between">
                    <button
                      onClick={() => {
                        setShowCourtWizard(false);
                        setEditingSlot(null);
                        setCourtForm({ dayOfWeek: "1", courtNumber: "3", startTime: "10:30", isSolo: false });
                      }}
                      className="text-sm text-muted hover:underline"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setCourtWizardStep(2)}
                      className="bg-indigo-500 text-white px-4 py-2 rounded text-sm hover:bg-indigo-600 transition-colors"
                    >
                      Next: Rebuild Games &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Rebuild Confirmation */}
              {courtWizardStep === 2 && (
                <div className="p-6">
                  <h2 className="text-lg font-semibold mb-4">Rebuild Games</h2>
                  <p className="text-sm text-muted mb-4">
                    This will back up your data, then regenerate all games from the updated court schedule. Holidays, players, and player constraints are preserved. All existing game assignments will be cleared.
                  </p>

                  {rebuildStatus === "" && (
                    <>
                      <p className="text-sm text-muted mb-3">
                        Type <strong>REBUILD</strong> to confirm:
                      </p>
                      <div className="flex gap-3 items-center mb-4">
                        <input
                          type="text"
                          value={rebuildConfirmText}
                          onChange={(e) => setRebuildConfirmText(e.target.value)}
                          placeholder="Type REBUILD"
                          className="border border-border rounded px-3 py-2 text-sm w-44"
                        />
                        <button
                          onClick={handleRebuildGames}
                          disabled={rebuildConfirmText !== "REBUILD"}
                          className="bg-danger text-white px-4 py-2 rounded text-sm disabled:opacity-40 transition-colors"
                        >
                          Rebuild Games
                        </button>
                      </div>
                      <div className="flex justify-between">
                        <button
                          onClick={() => setCourtWizardStep(1)}
                          className="text-sm text-muted hover:underline"
                        >
                          &larr; Back
                        </button>
                        <button
                          onClick={() => {
                            setShowCourtWizard(false);
                            setCourtWizardStep(1);
                            setRebuildConfirmText("");
                          }}
                          className="text-sm text-muted hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                  {rebuildStatus === "backing-up" && (
                    <p className="text-sm font-medium text-blue-600 mt-2">
                      Creating backup...
                    </p>
                  )}
                  {rebuildStatus === "rebuilding" && (
                    <p className="text-sm font-medium text-blue-600 mt-2">
                      Backup complete. Regenerating games...
                    </p>
                  )}
                  {rebuildStatus === "done" && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-green-700">
                        Games rebuilt successfully.
                      </p>
                      {backupResult && (
                        <p className="text-sm text-green-600 mt-1">{backupResult}</p>
                      )}
                    </div>
                  )}
                  {rebuildStatus === "error" && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-danger">{backupResult}</p>
                      <button
                        onClick={() => {
                          setRebuildStatus("");
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
          </div>
        )}
      </div>

      {/* Backup Settings */}
      <div className="border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-4">Backup Settings</h2>
        <div className="flex gap-4 items-end mb-4">
          <div className="flex-1">
            <label className="block text-sm text-muted mb-1">
              Backup Directory
            </label>
            <input
              type="text"
              value={backupDir}
              onChange={(e) => setBackupDir(e.target.value)}
              placeholder="Backup"
              className="border border-border rounded px-3 py-2 text-sm w-full"
            />
            <p className="text-xs text-muted mt-1">
              Relative to the project root, or an absolute path (e.g. /Volumes/ExternalDrive/Backups).
            </p>
          </div>
          <button
            onClick={handleSaveBackupDir}
            disabled={backupDirSaving}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {backupDirSaving ? "Saving..." : "Save"}
          </button>
        </div>
        {backupDirMessage && (
          <div
            className={`border rounded px-4 py-2 text-sm ${
              backupDirMessage.startsWith("Error") || backupDirMessage.startsWith("Failed")
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-green-50 border-green-200 text-green-800"
            }`}
          >
            {backupDirMessage}
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

          {/* Generate Games - only for first-time setup */}
          {totalGames === 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted mb-3">
                Creates a game slot for every court schedule entry for each of the {totalWeeks} weeks. Holiday dates are automatically marked.
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                title={`Creates a game slot for every court schedule entry for each of the ${totalWeeks} weeks. Holiday dates are automatically marked.`}
                className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate Games"}
              </button>

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

          {/* Games count display when games exist */}
          {totalGames > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted">
                {totalGames} games currently exist. Use <strong>Change Court Schedule</strong> above to modify courts and rebuild games.
              </p>
            </div>
          )}

        </div>
      )}

      {/* Don's Games: Auto-Assign All Weeks */}
      {activeSeason && totalGames > 0 && (
        <div className="border border-border rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Don&apos;s Games</h2>
          <p className="text-sm text-muted mb-3">
            Auto-assign Don&apos;s game slots for all weeks. Weeks that already have assignments are skipped.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDonsAssignAll}
              disabled={donsAssigning}
              title="Auto-assign all Don's games for every unassigned week. Solo games must be assigned first."
              className="bg-indigo-500 text-white px-4 py-2 rounded text-sm hover:bg-indigo-600 transition-colors disabled:opacity-50"
            >
              {donsAssigning ? (donsAssigningWeek ? `Assigning Wk ${donsAssigningWeek}...` : "Preparing...") : "Auto-Assign Don's"}
            </button>
            {donsAssigning && (
              <button
                onClick={() => { donsStopRef.current = true; }}
                className="border border-danger text-danger px-3 py-2 rounded text-sm hover:bg-red-50 transition-colors"
              >
                Stop
              </button>
            )}
            <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer select-none" title="Fill incomplete games with contracted players who are behind on their full 36-week season total. Runs after base and extra passes.">
              <input
                type="checkbox"
                checked={donsAssignStdCatchup}
                onChange={(e) => setDonsAssignStdCatchup(e.target.checked)}
                className="accent-indigo-500"
              />
              STD catchup
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer select-none" title="Allow 2+ contract players to play beyond their weekly minimum of 2 games to fill remaining slots.">
              <input
                type="checkbox"
                checked={donsAssignExtra}
                onChange={(e) => setDonsAssignExtra(e.target.checked)}
                className="accent-indigo-500"
              />
              Assign extra
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer select-none" title="Allow substitute (frequency 0) players to fill any remaining empty slots after all other passes.">
              <input
                type="checkbox"
                checked={donsAssignCSubs}
                onChange={(e) => setDonsAssignCSubs(e.target.checked)}
                className="accent-indigo-500"
              />
              Assign C subs
            </label>
            <button
              onClick={handleBalanceDonsBalls}
              disabled={donsBallsBalancing || donsAssigning}
              title="Redistributes ball-bringing duty across all Don's games for the entire season so each player brings balls for about 1/4 of their games."
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {donsBallsBalancing ? "Balancing..." : "Balance Don\u2019s Balls"}
            </button>
            <button
              onClick={handleBalanceDonsPairings}
              disabled={donsPairingsBalancing || donsAssigning}
              title="Swaps same-level players between same-day games to even out pairing frequencies across the season. Run after auto-assign. Re-run Balance Balls after if needed."
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {donsPairingsBalancing ? "Balancing..." : "Balance Pairings"}
            </button>
            <button
              onClick={handleClearDonsAssignAll}
              disabled={donsAssigning}
              title="Removes all Don's player assignments for the entire season. Solo assignments are not affected."
              className="border border-danger text-danger px-4 py-2 rounded text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Clear Don&apos;s Assignments
            </button>
          </div>

          {donsAssignMessage && (
            <div
              className={`border rounded px-4 py-2 mt-3 text-sm ${
                donsAssignMessage.startsWith("Error") ||
                donsAssignMessage.startsWith("Failed")
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-green-50 border-green-200 text-green-800"
              }`}
            >
              {donsAssignMessage}
            </div>
          )}

          {donsAssignLog.length > 0 && (
            <div className="mt-3 max-h-48 overflow-y-auto border border-amber-200 bg-amber-50 rounded p-3">
              <div className="text-xs font-semibold text-amber-800 mb-1">
                Log:
              </div>
              {donsAssignLog.map((entry, idx) => (
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
                  {entry.week ? `Week ${entry.week}: ` : ""}{entry.message}
                </div>
              ))}
            </div>
          )}

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

          {donsPairingsMessage && (
            <div
              className={`border rounded px-4 py-2 mt-3 text-sm ${
                donsPairingsMessage.startsWith("Error") ||
                donsPairingsMessage.startsWith("Failed")
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-green-50 border-green-200 text-green-800"
              }`}
            >
              {donsPairingsMessage}
            </div>
          )}
        </div>
      )}

      {/* Solo Games: Auto-Assign + Balance Balls */}
      {activeSeason && totalGames > 0 && (
        <div className="border border-border rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Solo Games</h2>
          <p className="text-sm text-muted mb-3">
            Assign solo game slots for all weeks and balance ball-bringing duty.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSoloAssign}
              disabled={soloAssigning}
              title="Assigns players to all solo game slots for all weeks based on solo share levels and pair settings. Best used on a fresh season."
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

      </>)}

      {activeTab === "new" && (
        <div className="border border-border rounded-lg p-6">
          <h2 className="font-semibold mb-4">Start a New Season</h2>
          <p className="text-sm text-muted">
            New Season wizard coming soon. This will allow you to create a new season with options to copy players, constraints, and court schedules from the current season.
          </p>
        </div>
      )}

    </div>
  );
}
