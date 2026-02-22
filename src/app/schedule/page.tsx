"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateExtraGamesPdf } from "@/lib/reports/extraGamesPdf";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface Season {
  id: number;
  startDate: string;
  endDate: string;
  maxDeratedPerWeek: number | null;
}

interface Assignment {
  id: number;
  gameId: number;
  playerId: number;
  slotPosition: number;
  isPrefill: boolean;
}

interface Game {
  id: number;
  gameNumber: number;
  seasonId: number;
  weekNumber: number;
  date: string;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  group: string;
  status: string;
  holidayName: string;
  assignments: Assignment[];
}

interface Player {
  id: number;
  firstName: string;
  lastName: string;
  isActive: boolean;
  contractedFrequency: string;
  skillLevel: string;
  soloShareLevel: string | null;
  blockedDays: number[];
  vacations: { startDate: string; endDate: string }[];
  noConsecutiveDays: boolean;
  isDerated: boolean;
  doNotPair: number[];
}

export default function SchedulePage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentWeek, setCurrentWeek] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("schedule_currentWeek");
      if (saved) {
        const num = parseInt(saved);
        if (num >= 1 && num <= 36) return num;
      }
    }
    return 1;
  });
  const [totalGames, setTotalGames] = useState(0);

  // Compliance check state
  const [violations, setViolations] = useState<{
    rule: string;
    severity: "error" | "warning";
    gameNumber: number;
    date: string;
    playerName: string;
    detail: string;
  }[]>([]);
  const [complianceChecked, setComplianceChecked] = useState(false);
  const [complianceGroup, setComplianceGroup] = useState<"dons" | "solo">("dons");
  const [checkingCompliance, setCheckingCompliance] = useState(false);

  // Player assignment popup state
  const [activeSlot, setActiveSlot] = useState<{
    gameId: number;
    slotPosition: number;
    replacingAssignmentId?: number;
  } | null>(null);
  const [searchText, setSearchText] = useState("");
  const [playerCounts, setPlayerCounts] = useState<Record<number, { wtd: number; ytd: number; ytdDons: number; ytdSolo: number; wtdDons: number; wtdSolo: number }>>({});
  const [showPlayerInfo, setShowPlayerInfo] = useState(false);
  const [bonusMode, setBonusMode] = useState<"off" | "bonus" | "bonusAll">("off");
  const [dropdownSort, setDropdownSort] = useState<"owed" | "ytd">("owed");

  // Previous week games (for "once per 2 weeks" derated pairing check)
  const [prevWeekGames, setPrevWeekGames] = useState<Game[]>([]);

  // Ball balance state
  const [balanceBallsGroup, setBalanceBallsGroup] = useState<"dons" | "solo" | null>(null);
  const [balanceBallsPreview, setBalanceBallsPreview] = useState<{
    swaps: number;
    preview: { gameId: number; gameNumber: number; date: string; oldBallBringerId: number; newBallBringerId: number }[];
    imbalance: number;
  } | null>(null);
  const [balanceBallsLoading, setBalanceBallsLoading] = useState(false);
  const [balanceBallsMessage, setBalanceBallsMessage] = useState("");

  // Extra Games state
  const [showExtraGames, setShowExtraGames] = useState(false);
  const [extraGamesData, setExtraGamesData] = useState<{
    rows: {
      playerName: string;
      playerId: number;
      gameNumber: number;
      gameId: number;
      date: string;
      dayOfWeek: number;
      players: string[];
      weekNumber: number;
    }[];
    currentMaxWeek: number;
  } | null>(null);
  const [extraGamesLoading, setExtraGamesLoading] = useState(false);

  // Auto-assign state
  const [autoAssignLoading, setAutoAssignLoading] = useState(false);
  const [autoAssignLog, setAutoAssignLog] = useState<{ type: string; day?: string; message: string }[]>([]);
  const [autoAssignCount, setAutoAssignCount] = useState(0);
  const [autoAssignError, setAutoAssignError] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Persist current week to localStorage
  useEffect(() => {
    localStorage.setItem("schedule_currentWeek", String(currentWeek));
  }, [currentWeek]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setActiveSlot(null);
        setSearchText("");
      }
    }
    if (activeSlot) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [activeSlot]);


  const loadSeason = useCallback(async () => {
    try {
      const res = await fetch("/api/seasons");
      const data = (await res.json()) as Season[];
      if (data.length > 0) {
        setSeason(data[data.length - 1]);
      }
    } catch (err) {
      console.error("Failed to load season:", err);
    }
  }, []);

  const loadGames = useCallback(
    async (seasonId: number, weekNum: number) => {
      try {
        const res = await fetch(
          `/api/games?seasonId=${seasonId}&weekNumber=${weekNum}`
        );
        const data = (await res.json()) as Game[];
        setGames(data);
      } catch (err) {
        console.error("Failed to load games:", err);
      }
    },
    []
  );

  const loadGamesCount = useCallback(async (seasonId: number) => {
    try {
      const res = await fetch(
        `/api/games?seasonId=${seasonId}&countOnly=true`
      );
      const data = (await res.json()) as { count: number };
      setTotalGames(data.count);
    } catch (err) {
      console.error("Failed to load games count:", err);
    }
  }, []);

  const loadPlayers = useCallback(async (seasonId: number) => {
    try {
      const res = await fetch(`/api/players?seasonId=${seasonId}`);
      const data = (await res.json()) as Player[];
      setPlayers(data.filter((p) => p.isActive));
    } catch (err) {
      console.error("Failed to load players:", err);
    }
  }, []);

  const loadPlayerCounts = useCallback(async (seasonId: number, weekNum: number) => {
    try {
      const res = await fetch(`/api/games/counts?seasonId=${seasonId}&weekNumber=${weekNum}`);
      const data = (await res.json()) as Record<number, { wtd: number; ytd: number; ytdDons: number; ytdSolo: number; wtdDons: number; wtdSolo: number }>;
      setPlayerCounts(data);
    } catch (err) {
      console.error("Failed to load player counts:", err);
    }
  }, []);

  useEffect(() => {
    loadSeason();
  }, [loadSeason]);

  useEffect(() => {
    if (season) {
      // Load sequentially to avoid concurrent SQLite access in dev
      loadGamesCount(season.id).then(() => loadPlayers(season.id));
    }
  }, [season, loadGamesCount, loadPlayers]);

  useEffect(() => {
    if (season && totalGames > 0) {
      setComplianceChecked(false);
      setViolations([]);
      setBonusMode("off");
      // Load sequentially to avoid concurrent SQLite access in dev
      loadGames(season.id, currentWeek)
        .then(() => loadPlayerCounts(season.id, currentWeek))
        .then(async () => {
          // Load previous week games for "once per 2 weeks" derated check
          if (season.maxDeratedPerWeek === 2 && currentWeek > 1) {
            try {
              const r = await fetch(`/api/games?seasonId=${season.id}&weekNumber=${currentWeek - 1}`);
              const data = (await r.json()) as Game[];
              setPrevWeekGames(data);
            } catch {
              setPrevWeekGames([]);
            }
          } else {
            setPrevWeekGames([]);
          }
        });
    }
  }, [season, currentWeek, totalGames, loadGames, loadPlayerCounts]);

  const handleAssignPlayer = async (
    gameId: number,
    slotPosition: number,
    playerId: number
  ) => {
    // Capture activeSlot before clearing so we can reference it safely
    const currentSlot = activeSlot;
    // Close dropdown immediately so the UI feels responsive
    setActiveSlot(null);
    setSearchText("");

    try {
      // If replacing an existing player, remove the old assignment first
      if (currentSlot?.replacingAssignmentId) {
        const delRes = await fetch(`/api/games/assign?id=${currentSlot.replacingAssignmentId}`, {
          method: "DELETE",
        });
        if (!delRes.ok) {
          console.error("Failed to delete old assignment:", await delRes.text());
        }
      }

      const res = await fetch("/api/games/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, slotPosition, playerId }),
      });

      if (!res.ok) {
        console.error("Failed to assign player:", await res.text());
      }

      // Always reload to keep UI in sync, sequentially to avoid concurrent D1 access
      if (season) {
        await loadGames(season.id, currentWeek);
        await loadPlayerCounts(season.id, currentWeek);
      }
    } catch (err) {
      console.error("Failed to assign player:", err);
      // Reload to restore consistent state after partial failure
      if (season) {
        try {
          await loadGames(season.id, currentWeek);
          await loadPlayerCounts(season.id, currentWeek);
        } catch { /* ignore reload errors */ }
      }
    }
  };



  const changeWeek = (week: number) => {
    setComplianceChecked(false);
    setViolations([]);
    setAutoAssignLog([]);
    setAutoAssignCount(0);
    setAutoAssignError("");
    setCurrentWeek(week);
  };

  const handleCheckCompliance = async (group: "dons" | "solo") => {
    if (!season) return;
    setCheckingCompliance(true);
    setComplianceGroup(group);
    try {
      const res = await fetch(
        `/api/games/compliance?seasonId=${season.id}&weekNumber=${currentWeek}&group=${group}`
      );
      const data = await res.json() as { violations?: Parameters<typeof setViolations>[0] };
      setViolations(data.violations ?? []);
      setComplianceChecked(true);
    } catch (err) {
      console.error("Failed to check compliance:", err);
    }
    setCheckingCompliance(false);
  };

  const handleBalanceBallsPreview = async (group: "dons" | "solo") => {
    if (!season) return;
    setBalanceBallsLoading(true);
    setBalanceBallsMessage("");
    setBalanceBallsGroup(group);
    try {
      const res = await fetch("/api/games/balance-balls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: season.id,
          weekNumber: currentWeek,
          group,
          apply: false,
        }),
      });
      const data = await res.json() as { error?: string; swaps?: number; preview?: unknown; imbalance?: number };
      if (data.error) {
        setBalanceBallsMessage(`Error: ${data.error}`);
        setBalanceBallsPreview(null);
      } else {
        setBalanceBallsPreview(data as Parameters<typeof setBalanceBallsPreview>[0]);
      }
    } catch (err) {
      console.error("Failed to preview ball balance:", err);
      setBalanceBallsMessage("Failed to preview ball balance");
    }
    setBalanceBallsLoading(false);
  };

  const handleBalanceBallsApply = async () => {
    if (!season || !balanceBallsGroup) return;
    setBalanceBallsLoading(true);
    try {
      const res = await fetch("/api/games/balance-balls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: season.id,
          weekNumber: currentWeek,
          group: balanceBallsGroup,
          apply: true,
        }),
      });
      const data = await res.json() as { error?: string; swaps?: number };
      if (data.error) {
        setBalanceBallsMessage(`Error: ${data.error}`);
      } else {
        setBalanceBallsMessage(
          `Applied ${data.swaps} ball swap${data.swaps !== 1 ? "s" : ""} successfully`
        );
        setBalanceBallsPreview(null);
        // Reload games to reflect changes
        await loadGames(season.id, currentWeek);
        await loadPlayerCounts(season.id, currentWeek);
      }
    } catch (err) {
      console.error("Failed to apply ball balance:", err);
      setBalanceBallsMessage("Failed to apply ball balance");
    }
    setBalanceBallsLoading(false);
  };

  const handleShowExtraGames = async () => {
    if (!season) return;
    setShowExtraGames(true);
    setExtraGamesLoading(true);
    try {
      const res = await fetch(`/api/games/extra?seasonId=${season.id}`);
      const data = await res.json() as Parameters<typeof setExtraGamesData>[0];
      setExtraGamesData(data);
    } catch (err) {
      console.error("Failed to load extra games:", err);
    }
    setExtraGamesLoading(false);
  };

  const handleAutoAssign = async () => {
    if (!season) return;
    setAutoAssignLoading(true);
    setAutoAssignError("");
    setAutoAssignLog([]);
    setAutoAssignCount(0);
    try {
      const res = await fetch("/api/games/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: season.id, weekNumber: currentWeek }),
      });
      const data = await res.json() as {
        success?: boolean;
        error?: string;
        assignedCount?: number;
        totalSlots?: number;
        unfilled?: number;
        assignmentIds?: number[];
        log?: { type: string; day?: string; message: string }[];
      };
      if (!res.ok) {
        setAutoAssignError(data.error ?? "Auto-assign failed");
        if (data.log) setAutoAssignLog(data.log);
      } else {
        setAutoAssignLog(data.log ?? []);
        setAutoAssignCount(data.assignedCount ?? 0);
        // Reload games and counts
        await loadGames(season.id, currentWeek);
        await loadPlayerCounts(season.id, currentWeek);
      }
    } catch (err) {
      console.error("Auto-assign failed:", err);
      setAutoAssignError("Auto-assign failed unexpectedly");
    }
    setAutoAssignLoading(false);
  };

  const handleClearDonsAssignments = async () => {
    if (!season) return;
    if (!confirm("Clear all Don's game assignments for this week?")) return;
    setAutoAssignLoading(true);
    try {
      const res = await fetch("/api/games/auto-assign", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: season.id, weekNumber: currentWeek }),
      });
      if (res.ok) {
        setAutoAssignLog([]);
        setAutoAssignError("");
        await loadGames(season.id, currentWeek);
        await loadPlayerCounts(season.id, currentWeek);
      } else {
        const data = await res.json() as { error?: string };
        setAutoAssignError(data.error ?? "Clear failed");
      }
    } catch (err) {
      console.error("Clear Don's assignments failed:", err);
      setAutoAssignError("Clear failed unexpectedly");
    }
    setAutoAssignLoading(false);
  };

  // Check if player has a YTD deficit (behind schedule due to vacation/illness)
  // Uses group-specific YTD and frequency when group is provided
  const hasYtdDeficit = (player: Player, group?: string): boolean => {
    const freq = group ? getEffectiveFreq(player, group) : (parseInt(player.contractedFrequency) || 0);
    if (freq === 0) return false;
    const expectedYtd = freq * currentWeek;
    const counts = playerCounts[player.id];
    const actualYtd = group === "solo" ? (counts?.ytdSolo ?? 0) : group === "dons" ? (counts?.ytdDons ?? 0) : (counts?.ytd ?? 0);
    return actualYtd < expectedYtd;
  };

  // Get the effective weekly frequency for a player in a given group
  // For dons: uses contract frequency. For solo: uses solo share level.
  const soloShareFreq: Record<string, number> = { full: 1, half: 0.5 };
  const getEffectiveFreq = (player: Player, gameGroup: string): number => {
    if (gameGroup === "solo") {
      return player.soloShareLevel ? (soloShareFreq[player.soloShareLevel] ?? 0) : 0;
    }
    return parseInt(player.contractedFrequency) || 0;
  };

  const getPlayerName = (playerId: number): string => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return "Unknown";

    // Check for duplicate last names
    const sameLastName = players.filter(
      (p) => p.lastName === player.lastName && p.id !== player.id
    );
    if (sameLastName.length > 0) {
      return `${player.lastName}${player.firstName.charAt(0)}`;
    }
    return player.lastName;
  };

  const getAvailablePlayers = (game: Game): Player[] => {
    const assignedPlayerIds = new Set(
      game.assignments.map((a) => a.playerId)
    );

    // Also get all player IDs assigned to any game on the same date
    const sameDate = games.filter(
      (g) => g.date === game.date && g.id !== game.id
    );
    const sameDatePlayerIds = new Set<number>();
    for (const g of sameDate) {
      for (const a of g.assignments) {
        sameDatePlayerIds.add(a.playerId);
      }
    }

    return players.filter((p) => {
      // Already in this game
      if (assignedPlayerIds.has(p.id)) return false;

      // Already playing another game on the same date (one game per day rule)
      if (sameDatePlayerIds.has(p.id)) return false;

      // Solo games require a non-zero solo share
      if (game.group === "solo" && !p.soloShareLevel) return false;

      // Day of week blocked
      if (p.blockedDays?.some((bd) => bd === game.dayOfWeek))
        return false;

      // On vacation
      if (
        p.vacations?.some((v) => {
          return game.date >= v.startDate && game.date <= v.endDate;
        })
      )
        return false;

      // Do-not-pair: filter out players who conflict with already-assigned players
      if (p.doNotPair?.length) {
        for (const assignedId of assignedPlayerIds) {
          if (p.doNotPair.includes(assignedId)) return false;
        }
      }
      // Also check the reverse: if any assigned player has this player in their DNP list
      for (const assignedId of assignedPlayerIds) {
        const assignedPlayer = players.find((pl) => pl.id === assignedId);
        if (assignedPlayer?.doNotPair?.includes(p.id)) return false;
      }

      // Derated pairing limit: if this candidate is derated and there's a cap,
      // check if any already-assigned (non-derated) player in this game has
      // already been paired with THIS SPECIFIC derated player within the window.
      // maxDeratedPerWeek=1 → once per week, maxDeratedPerWeek=2 → once per 2 weeks
      if (p.isDerated && season?.maxDeratedPerWeek != null) {
        // Collect all games to check (current week, plus previous week if setting = 2)
        const gamesToCheck = [...games];
        if (season.maxDeratedPerWeek === 2) {
          gamesToCheck.push(...prevWeekGames);
        }

        for (const assignedId of assignedPlayerIds) {
          const assignedPlayer = players.find((pl) => pl.id === assignedId);
          if (!assignedPlayer || assignedPlayer.isDerated) continue;

          // Check if this assigned player was already paired with THIS specific derated candidate
          let alreadyPaired = false;
          for (const g of gamesToCheck) {
            if (g.status !== "normal") continue;
            if (g.id === game.id) continue; // don't count the current game being assigned
            const inGame = g.assignments.some((a) => a.playerId === assignedId);
            if (!inGame) continue;
            const candidateInGame = g.assignments.some((a) => a.playerId === p.id);
            if (candidateInGame) {
              alreadyPaired = true;
              break;
            }
          }
          if (alreadyPaired) return false;
        }
      }

      return true;
    });
  };

  // Check if a player MUST be assigned to this specific game's date
  // (i.e., it's their only remaining playable day this week and they still owe games)
  const isMustPlay = (player: Player, game: Game): boolean => {
    const counts = playerCounts[player.id] ?? { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
    const freq = getEffectiveFreq(player, game.group);
    const groupWtd = game.group === "solo" ? counts.wtdSolo : counts.wtdDons;
    const remaining = freq - groupWtd;

    // Player doesn't owe any more games this week
    if (remaining <= 0) return false;

    // Get all unique dates this week that have open slots for this game's group
    const datesWithOpenSlots = new Set<string>();
    for (const g of games) {
      if (g.status !== "normal") continue;
      if (g.group !== game.group) continue;
      // Check if game has an open slot (fewer than 4 assignments)
      if (g.assignments.length < 4) {
        datesWithOpenSlots.add(g.date);
      }
    }

    // Get all dates this player is already assigned to this week
    const assignedDates = new Set<string>();
    for (const g of games) {
      if (g.status !== "normal") continue;
      if (g.assignments.some((a) => a.playerId === player.id)) {
        assignedDates.add(g.date);
      }
    }

    // Filter to dates the player can actually play on
    const playableDates: string[] = [];
    for (const date of datesWithOpenSlots) {
      // Already assigned on this date
      if (assignedDates.has(date)) continue;

      // Get day of week for this date
      const dateGames = games.filter((g) => g.date === date);
      if (dateGames.length === 0) continue;
      const dow = dateGames[0].dayOfWeek;

      // Day is blocked
      if (player.blockedDays?.some((bd) => bd === dow)) continue;

      // On vacation
      if (player.vacations?.some((v) => date >= v.startDate && date <= v.endDate)) continue;

      playableDates.push(date);
    }

    // MUST play if this is their only remaining playable day
    return playableDates.length === 1 && playableDates[0] === game.date;
  };

  // Check if all contracted players (1x and 2x) have fulfilled their weekly quota
  const allOwedFulfilled = (): boolean => {
    for (const p of players) {
      const freq = parseInt(p.contractedFrequency) || 0;
      if (freq === 0) continue; // skip subs and 2+ (which is "2+", not a number)
      if (p.contractedFrequency === "2+") continue;
      const counts = playerCounts[p.id] ?? { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
      if (counts.wtdDons < freq) return false;
    }
    return true;
  };

  // Sort games: day → time → court
  const sortedGames = [...games].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    if (a.startTime !== b.startTime)
      return a.startTime.localeCompare(b.startTime);
    return a.courtNumber - b.courtNumber;
  });

  // Group games by date for visual grouping
  const gamesByDate = new Map<string, Game[]>();
  for (const game of sortedGames) {
    const existing = gamesByDate.get(game.date) ?? [];
    existing.push(game);
    gamesByDate.set(game.date, existing);
  }

  if (!season) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Schedule</h1>
        <p className="text-muted">
          Please{" "}
          <a href="/season" className="text-primary underline">
            create a season
          </a>{" "}
          first.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">Schedule</h1>

      {totalGames === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-lg mb-2">No games generated yet</p>
          <p className="text-sm">
            Set up your{" "}
            <a href="/courts" className="text-primary underline">
              court schedule
            </a>
            , then click &quot;Generate Games&quot; above.
          </p>
        </div>
      ) : (
        <>
          {/* Week navigation */}
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <button
              onClick={() => changeWeek(1)}
              disabled={currentWeek === 1}
              className="px-3 py-1 border border-border rounded text-sm disabled:opacity-30 hover:bg-gray-100"
            >
              First
            </button>
            <button
              onClick={() => changeWeek(Math.max(1, currentWeek - 1))}
              disabled={currentWeek === 1}
              className="px-3 py-1 border border-border rounded text-sm disabled:opacity-30 hover:bg-gray-100"
            >
              &#8592; Prev
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Week</span>
              <select
                value={currentWeek}
                onChange={(e) => changeWeek(parseInt(e.target.value))}
                className="border border-border rounded px-2 py-1 text-sm"
              >
                {Array.from({ length: 36 }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              <span className="text-sm text-muted">of 36</span>
            </div>
            <button
              onClick={() => changeWeek(Math.min(36, currentWeek + 1))}
              disabled={currentWeek === 36}
              className="px-3 py-1 border border-border rounded text-sm disabled:opacity-30 hover:bg-gray-100"
            >
              Next &#8594;
            </button>

            <span className="text-xs text-muted ml-auto mr-3">
              {games.length} games this week &middot; {totalGames} total
            </span>
            {games.filter((g) => g.group === "dons" && g.status === "normal").some((g) => g.assignments.length > 0) ? (
              <button
                onClick={handleClearDonsAssignments}
                disabled={autoAssignLoading}
                className="px-4 py-2 bg-red-500 text-white font-semibold rounded-lg shadow-sm hover:bg-red-600 active:bg-red-700 disabled:opacity-40 transition-colors text-sm"
              >
                {autoAssignLoading ? "Clearing..." : "Clear Don's"}
              </button>
            ) : (
              <button
                onClick={handleAutoAssign}
                disabled={autoAssignLoading || games.length === 0}
                title="Auto-assign all Don's games for this week"
                className="px-4 py-2 bg-indigo-500 text-white font-semibold rounded-lg shadow-sm hover:bg-indigo-600 active:bg-indigo-700 disabled:opacity-40 transition-colors text-sm"
              >
                {autoAssignLoading ? "Assigning..." : "Auto-Assign"}
              </button>
            )}
            <button
              onClick={() => setShowPlayerInfo(true)}
              className="px-4 py-2 font-semibold rounded-lg shadow-sm transition-colors text-sm bg-blue-500 text-white hover:bg-blue-600"
            >
              Player Info
            </button>
            <button
              onClick={() => setBonusMode((m) => m === "bonus" ? "off" : "bonus")}
              disabled={!allOwedFulfilled() && bonusMode !== "bonus"}
              title={
                !allOwedFulfilled() && bonusMode !== "bonus"
                  ? "All contracted players must be assigned first"
                  : "Show 2+ players for bonus games"
              }
              className={`px-4 py-2 font-semibold rounded-lg shadow-sm transition-colors text-sm ${
                bonusMode === "bonus"
                  ? "bg-green-800 text-white hover:bg-green-900"
                  : "bg-green-700 text-white hover:bg-green-800 disabled:opacity-40"
              }`}
            >
              {bonusMode === "bonus" ? "✓ Bonus" : "+ Bonus"}
            </button>
            <button
              onClick={() => setBonusMode((m) => m === "bonusAll" ? "off" : "bonusAll")}
              className={`px-4 py-2 font-semibold rounded-lg shadow-sm transition-colors text-sm ${
                bonusMode === "bonusAll"
                  ? "bg-green-700 text-white hover:bg-green-800"
                  : "bg-green-500 text-white hover:bg-green-600"
              }`}
            >
              {bonusMode === "bonusAll" ? "✓ Bonus All" : "Bonus All"}
            </button>
            <button
              onClick={() => handleBalanceBallsPreview("dons")}
              disabled={balanceBallsLoading || games.length === 0}
              className="px-4 py-2 bg-purple-500 text-white font-semibold rounded-lg shadow-sm hover:bg-purple-600 active:bg-purple-700 disabled:opacity-40 transition-colors text-sm"
              title="Balance ball-bringing duty across Don's group players"
            >
              {balanceBallsLoading && balanceBallsGroup === "dons" ? "..." : "Balls Don's"}
            </button>
            <button
              onClick={() => handleCheckCompliance("dons")}
              disabled={checkingCompliance || games.length === 0}
              className="px-4 py-2 bg-amber-500 text-white font-semibold rounded-lg shadow-sm hover:bg-amber-600 active:bg-amber-700 disabled:opacity-40 transition-colors text-sm"
            >
              {checkingCompliance && complianceGroup === "dons" ? "Checking..." : "Don's Compliance"}
            </button>
            <button
              onClick={() => handleCheckCompliance("solo")}
              disabled={checkingCompliance || games.length === 0}
              className="px-4 py-2 bg-amber-500 text-white font-semibold rounded-lg shadow-sm hover:bg-amber-600 active:bg-amber-700 disabled:opacity-40 transition-colors text-sm"
            >
              {checkingCompliance && complianceGroup === "solo" ? "Checking..." : "Solo Compliance"}
            </button>
            <button
              onClick={handleShowExtraGames}
              disabled={totalGames === 0}
              className="px-4 py-2 bg-teal-500 text-white font-semibold rounded-lg shadow-sm hover:bg-teal-600 active:bg-teal-700 disabled:opacity-40 transition-colors text-sm"
              title="Show extra games assigned beyond contracted frequency (Don's group)"
            >
              Display Extra
            </button>
          </div>

          {/* Player Info Panel */}
          {showPlayerInfo && (() => {
            const DAY_ABBR = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
            // Get the date range for the current week from games
            const weekDates = games.map((g) => g.date);
            const weekStart = weekDates.length > 0 ? weekDates.reduce((a, b) => (a < b ? a : b)) : "";
            const weekEnd = weekDates.length > 0 ? weekDates.reduce((a, b) => (a > b ? a : b)) : "";

            // Don's group players (active, with contracted frequency > 0)
            const donsPlayers = players
              .filter((p) => {
                const freq = parseInt(p.contractedFrequency) || 0;
                return freq > 0;
              })
              .sort((a, b) => a.lastName.localeCompare(b.lastName));

            return (
              <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 mb-4">
                <div className="text-xs font-semibold text-blue-800 mb-2 flex items-center justify-between">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span>Don&apos;s Group — Player Status (Week {currentWeek})</span>
                    <span className="font-normal">
                      <span className="text-gray-500">Contract</span>
                      <span className="text-blue-300 mx-0.5">/</span>
                      <span className="text-green-700">Owed WTD</span>
                      <span className="text-blue-300 mx-0.5">/</span>
                      <span className="text-amber-600">Owed YTD</span>
                      <span className="text-blue-300 mx-1">|</span>
                      <span className="text-gray-500">Name</span>
                    </span>
                  </div>
                  <button
                    onClick={() => setShowPlayerInfo(false)}
                    className="text-xs text-muted hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                  {donsPlayers.map((p) => {
                    const counts = playerCounts[p.id] ?? { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
                    const freq = parseInt(p.contractedFrequency) || 0;
                    const owe = freq - counts.wtdDons;
                    const expectedYtd = freq * currentWeek;
                    const ytdOwed = expectedYtd - counts.ytdDons;
                    const onVacation = weekStart && weekEnd && p.vacations?.some(
                      (v) => v.startDate <= weekEnd && v.endDate >= weekStart
                    );
                    const blockedAbbr = (p.blockedDays ?? []).sort().map((d) => DAY_ABBR[d]).join(",");

                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-white border border-blue-100"
                      >
                        <span
                          className="font-mono w-3 text-center text-gray-500"
                          title={`Contract: ${freq}/week`}
                        >
                          {freq}
                        </span>
                        <span
                          className={`font-mono w-4 text-center ${
                            owe > 0 ? "text-green-700 font-bold" : ""
                          }`}
                          title={`Owe ${owe} game(s) this week`}
                        >
                          {owe}
                        </span>
                        <span
                          className={`font-mono w-4 text-center ${
                            ytdOwed > 0 ? "text-amber-600 font-bold" : ""
                          }`}
                          title={`YTD Owed: ${expectedYtd} expected − ${counts.ytdDons} played = ${ytdOwed}`}
                        >
                          {ytdOwed}
                        </span>
                        <span className="truncate max-w-[80px]" title={`${p.lastName}, ${p.firstName}`}>
                          {p.lastName.length > 20 ? p.lastName.slice(0, 20) + "…" : p.lastName}
                        </span>
                        {blockedAbbr && (
                          <span className="text-gray-400" title={`Blocked: ${blockedAbbr}`}>
                            [{blockedAbbr}]
                          </span>
                        )}
                        {onVacation && (
                          <span className="text-red-500 font-bold" title="On vacation this week">
                            V
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Compliance violations */}
          {complianceChecked && (
            <div className={`border rounded px-4 py-3 mb-4 text-sm ${
              violations.length === 0
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200"
            }`}>
              {violations.length === 0 ? (
                <div className="flex items-center gap-2">
                  <span>&#10003;</span>
                  <span>No {complianceGroup === "dons" ? "Don's" : "Solo"} compliance issues found for week {currentWeek}.</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-red-800">
                      {complianceGroup === "dons" ? "Don's" : "Solo"}: {violations.length} compliance issue{violations.length !== 1 ? "s" : ""} found
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleCheckCompliance(complianceGroup)}
                        disabled={checkingCompliance}
                        className="text-xs text-primary hover:underline disabled:opacity-50"
                      >
                        {checkingCompliance ? "Refreshing..." : "Refresh"}
                      </button>
                      <button
                        onClick={() => { setComplianceChecked(false); setViolations([]); }}
                        className="text-xs text-muted hover:underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-red-700">
                        <th className="pb-1 pr-2 w-8"></th>
                        <th className="pb-1 pr-2">Rule</th>
                        <th className="pb-1 pr-2">Player</th>
                        <th className="pb-1 pr-2">Date</th>
                        <th className="pb-1">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {violations.map((v, idx) => (
                        <tr key={idx} className="border-t border-red-100">
                          <td className="py-1 pr-2">
                            {v.severity === "error" ? (
                              <span className="text-red-600" title="Error">&#9888;</span>
                            ) : (
                              <span className="text-amber-500" title="Warning">&#9888;</span>
                            )}
                          </td>
                          <td className="py-1 pr-2 font-medium text-red-800">{v.rule}</td>
                          <td className="py-1 pr-2">{v.playerName}</td>
                          <td className="py-1 pr-2">{v.date ? formatDisplayDate(v.date) : "-"}</td>
                          <td className="py-1 text-muted">{v.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* Auto-assign error */}
          {autoAssignError && (
            <div className="border border-red-200 bg-red-50 rounded px-4 py-3 mb-4 text-sm flex items-center justify-between">
              <span className="text-red-800">{autoAssignError}</span>
              <button
                onClick={() => setAutoAssignError("")}
                className="text-xs text-muted hover:underline ml-4"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Auto-assign log panel */}
          {autoAssignLog.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded px-4 py-3 mb-4 text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-indigo-800">
                  Auto-Assign Report {autoAssignCount > 0 ? `\u2014 ${autoAssignCount} players assigned` : ""}
                </span>
                <button
                  onClick={() => { setAutoAssignLog([]); }}
                  className="text-xs text-muted hover:underline"
                >
                  Dismiss
                </button>
              </div>
              <div className="space-y-0.5 max-h-64 overflow-y-auto">
                {autoAssignLog.map((entry, idx) => (
                  <div
                    key={idx}
                    className={`text-xs flex items-start gap-2 ${
                      entry.type === "error" ? "text-red-700" : entry.type === "warning" ? "text-amber-700" : "text-indigo-700"
                    }`}
                  >
                    <span className="flex-shrink-0">
                      {entry.type === "error" ? "\u26A0" : entry.type === "warning" ? "\u26A0" : "\u2713"}
                    </span>
                    <span>{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ball balance message */}
          {balanceBallsMessage && (
            <div className={`border rounded px-4 py-3 mb-4 text-sm flex items-center justify-between ${
              balanceBallsMessage.startsWith("Error")
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-green-50 border-green-200 text-green-800"
            }`}>
              <span>{balanceBallsMessage}</span>
              <button
                onClick={() => setBalanceBallsMessage("")}
                className="text-xs text-muted hover:underline ml-4"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Ball balance preview dialog */}
          {balanceBallsPreview && (
            <div className="bg-purple-50 border border-purple-200 rounded px-4 py-3 mb-4 text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-purple-800">
                  &#9878; Ball Balance Preview &mdash; {balanceBallsGroup === "dons" ? "Don's" : "Solo"} (Week {currentWeek})
                </span>
                <span className="text-xs text-purple-600">
                  Imbalance score: {balanceBallsPreview.imbalance}
                </span>
              </div>
              {balanceBallsPreview.swaps === 0 ? (
                <div className="text-purple-700 mb-2">
                  No swaps needed &mdash; ball duties are already balanced.
                </div>
              ) : (
                <>
                  <div className="text-purple-700 mb-2">
                    {balanceBallsPreview.swaps} swap{balanceBallsPreview.swaps !== 1 ? "s" : ""} proposed:
                  </div>
                  <table className="w-full text-xs mb-3">
                    <thead>
                      <tr className="text-left text-purple-700">
                        <th className="pb-1 pr-2">Game #</th>
                        <th className="pb-1 pr-2">Date</th>
                        <th className="pb-1 pr-2">Current Ball Bringer</th>
                        <th className="pb-1 pr-2">&#8594;</th>
                        <th className="pb-1">New Ball Bringer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balanceBallsPreview.preview.map((swap, idx) => (
                        <tr key={idx} className="border-t border-purple-100">
                          <td className="py-1 pr-2">{swap.gameNumber}</td>
                          <td className="py-1 pr-2">{formatDisplayDate(swap.date)}</td>
                          <td className="py-1 pr-2 text-red-600">{getPlayerName(swap.oldBallBringerId)}</td>
                          <td className="py-1 pr-2">&#8594;</td>
                          <td className="py-1 text-green-700 font-medium">{getPlayerName(swap.newBallBringerId)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              <div className="flex gap-2">
                {balanceBallsPreview.swaps > 0 && (
                  <button
                    onClick={handleBalanceBallsApply}
                    disabled={balanceBallsLoading}
                    className="bg-purple-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                  >
                    {balanceBallsLoading ? "Applying..." : "Apply Swaps"}
                  </button>
                )}
                <button
                  onClick={() => {
                    setBalanceBallsPreview(null);
                    setBalanceBallsGroup(null);
                  }}
                  className="border border-purple-300 text-purple-700 px-4 py-1.5 rounded text-sm hover:bg-purple-100"
                >
                  {balanceBallsPreview.swaps === 0 ? "Close" : "Cancel"}
                </button>
              </div>
            </div>
          )}

          {/* Games table */}
          {games.length === 0 ? (
            <p className="text-muted text-sm">
              No games for week {currentWeek}.
            </p>
          ) : (
            <div className="space-y-4">
              {Array.from(gamesByDate.entries()).map(([date, dateGames]) => (
                <div key={date}>
                  <div className="text-sm font-semibold text-muted mb-2 flex items-center gap-2">
                    <span>
                      {DAYS[dateGames[0].dayOfWeek]} &mdash;{" "}
                      {formatDisplayDate(date)}
                    </span>
                    {dateGames[0].status === "holiday" ? (
                      <button
                        onClick={async () => {
                          if (!season) return;
                          if (!confirm(`Remove holiday for ${formatDisplayDate(date)}? Games will return to normal status.`)) return;
                          await fetch("/api/games/toggle-holiday", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ seasonId: season.id, date }),
                          });
                          await loadGames(season.id, currentWeek);
                        }}
                        className="text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded transition-colors"
                        title="Remove holiday — restore games to normal"
                      >
                        {dateGames[0].holidayName || "Holiday"} &times;
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          if (!season) return;
                          const name = window.prompt(`Mark ${formatDisplayDate(date)} as a holiday.\nAll assignments for this date will be cleared.\n\nHoliday name (optional):`);
                          if (name === null) return; // cancelled
                          await fetch("/api/games/toggle-holiday", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ seasonId: season.id, date, name }),
                          });
                          await loadGames(season.id, currentWeek);
                        }}
                        className="text-xs text-muted hover:text-amber-700 hover:bg-amber-50 px-2 py-0.5 rounded transition-colors"
                        title="Mark this date as a holiday"
                      >
                        + Holiday
                      </button>
                    )}
                  </div>
                  <table className="w-full text-sm border border-border mb-4">
                    <colgroup>
                      <col className="w-14" />
                      <col className="w-16" />
                      <col className="w-16" />
                      <col className="w-14" />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "14%" }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-2 border-b border-border">
                          #
                        </th>
                        <th className="text-left p-2 border-b border-border">
                          Time
                        </th>
                        <th className="text-left p-2 border-b border-border">
                          Court
                        </th>
                        <th className="text-left p-2 border-b border-border border-r-2">
                          Group
                        </th>
                        <th className="text-left p-2 border-b border-border">
                          Player 1 &#127934;
                        </th>
                        <th className="text-left p-2 border-b border-border">
                          Player 2
                        </th>
                        <th className="text-left p-2 border-b border-border">
                          Player 3
                        </th>
                        <th className="text-left p-2 border-b border-border">
                          Player 4
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateGames.map((game, gameIdx) => (
                        <tr
                          key={game.id}
                          className={`border-b border-border ${
                            game.status === "holiday"
                              ? "bg-amber-50"
                              : game.status === "blanked"
                                ? "bg-gray-100 opacity-50"
                                : gameIdx % 2 === 1 ? "bg-[#fdf8f0]" : "bg-white"
                          }`}
                        >
                          <td className="p-2 text-muted">
                            {game.gameNumber}
                          </td>
                          <td className="p-2">{game.startTime}</td>
                          <td className="p-2">{game.courtNumber}</td>
                          <td className="p-2 border-r-2 border-border">
                            {game.group === "solo" ? (
                              <span className="text-solo-orange font-medium text-xs">
                                Solo
                              </span>
                            ) : (
                              <span className="text-xs">Don&apos;s</span>
                            )}
                          </td>
                          {game.status === "holiday" ? (
                            <td
                              colSpan={4}
                              className="p-2 text-amber-700 font-medium text-center"
                            >
                              {game.holidayName || "Holiday"}
                            </td>
                          ) : game.status === "blanked" ? (
                            <td
                              colSpan={4}
                              className="p-2 text-gray-400 text-center"
                            >
                              Blanked
                            </td>
                          ) : (
                            [1, 2, 3, 4].map((slot) => {
                              const assignment = game.assignments.find(
                                (a) => a.slotPosition === slot
                              );
                              const isActive =
                                activeSlot?.gameId === game.id &&
                                activeSlot?.slotPosition === slot;

                              return (
                                <td key={slot} className="p-2 relative">
                                  {assignment ? (
                                    <button
                                      onClick={() =>
                                        setActiveSlot(
                                          isActive
                                            ? null
                                            : {
                                                gameId: game.id,
                                                slotPosition: slot,
                                                replacingAssignmentId: assignment.id,
                                              }
                                        )
                                      }
                                      className={`text-left hover:underline hover:text-primary cursor-pointer ${
                                        assignment.isPrefill ? "text-blue-600" : ""
                                      }`}
                                    >
                                      {getPlayerName(assignment.playerId)}
                                      {(() => {
                                        const ap = players.find((pl) => pl.id === assignment.playerId);
                                        return ap?.isDerated ? (
                                          <span className="text-orange-500 font-bold text-xs ml-0.5" title="Derated player">D</span>
                                        ) : null;
                                      })()}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setActiveSlot(
                                          isActive
                                            ? null
                                            : {
                                                gameId: game.id,
                                                slotPosition: slot,
                                              }
                                        )
                                      }
                                      className="w-full text-left text-gray-300 hover:text-primary hover:bg-primary/5 rounded px-1 py-0.5 transition-colors"
                                    >
                                      + assign
                                    </button>
                                  )}

                                  {/* Player assignment dropdown */}
                                  {isActive && (
                                    <div
                                      ref={dropdownRef}
                                      className="absolute top-full left-0 z-50 bg-white border border-border rounded-lg shadow-lg w-64 mt-1"
                                    >
                                      <div className="flex justify-between px-2 py-0.5 text-xs text-muted font-semibold border-b border-border bg-gray-50">
                                        <span>Player</span>
                                        <span className="flex gap-3">
                                          <span
                                            className={`w-8 text-center cursor-pointer hover:text-primary select-none ${dropdownSort === "owed" ? "text-primary underline" : ""}`}
                                            onClick={(e) => { e.stopPropagation(); setDropdownSort("owed"); }}
                                          >
                                            Owed {dropdownSort === "owed" ? "v" : ""}
                                          </span>
                                          <span
                                            className={`w-8 text-center cursor-pointer hover:text-primary select-none ${dropdownSort === "ytd" ? "text-primary underline" : ""}`}
                                            onClick={(e) => { e.stopPropagation(); setDropdownSort("ytd"); }}
                                          >
                                            YTD {dropdownSort === "ytd" ? "v" : ""}
                                          </span>
                                        </span>
                                      </div>
                                      {activeSlot?.replacingAssignmentId && (
                                        <button
                                          onClick={async () => {
                                            try {
                                              const res = await fetch(`/api/games/assign?id=${activeSlot.replacingAssignmentId}`, { method: "DELETE" });
                                              if (res.ok && season) {
                                                await loadGames(season.id, currentWeek);
                                                await loadPlayerCounts(season.id, currentWeek);
                                              }
                                            } catch (err) {
                                              console.error("Failed to remove assignment:", err);
                                            }
                                            setActiveSlot(null);
                                            setSearchText("");
                                          }}
                                          className="w-full text-left px-2 py-1 text-xs text-red-600 hover:bg-red-50 border-b border-border font-medium"
                                        >
                                          ✕ Remove player
                                        </button>
                                      )}
                                      <div className="max-h-[70vh] overflow-y-auto">
                                        {(() => {
                                          const allAvailable = getAvailablePlayers(game);

                                          // Regular players: owe games or have YTD deficit
                                          const regularPlayers = allAvailable
                                            .filter((p) => {
                                              const counts = playerCounts[p.id] ?? { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
                                              const freq = getEffectiveFreq(p, game.group);
                                              const groupWtd = game.group === "solo" ? counts.wtdSolo : counts.wtdDons;
                                              const weeklyOwed = freq - groupWtd;
                                              return weeklyOwed > 0 || hasYtdDeficit(p, game.group);
                                            })
                                            .sort((a, b) => {
                                              // MUST players always first
                                              const aMust = isMustPlay(a, game);
                                              const bMust = isMustPlay(b, game);
                                              if (aMust !== bMust) return aMust ? -1 : 1;

                                              const aCounts = playerCounts[a.id] ?? { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
                                              const bCounts = playerCounts[b.id] ?? { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
                                              const aFreq = getEffectiveFreq(a, game.group);
                                              const bFreq = getEffectiveFreq(b, game.group);
                                              const aOwed = aFreq - (game.group === "solo" ? aCounts.wtdSolo : aCounts.wtdDons);
                                              const bOwed = bFreq - (game.group === "solo" ? bCounts.wtdSolo : bCounts.wtdDons);
                                              const aYtdOwed = aFreq * currentWeek - (game.group === "solo" ? aCounts.ytdSolo : aCounts.ytdDons);
                                              const bYtdOwed = bFreq * currentWeek - (game.group === "solo" ? bCounts.ytdSolo : bCounts.ytdDons);

                                              if (dropdownSort === "ytd") {
                                                // Sort by YTD owed descending, then WTD owed, then name
                                                if (bYtdOwed !== aYtdOwed) return bYtdOwed - aYtdOwed;
                                                if (bOwed !== aOwed) return bOwed - aOwed;
                                                return a.lastName.localeCompare(b.lastName);
                                              }

                                              // Default "owed": sort by WTD owed descending, then YTD owed, then name
                                              if (bOwed !== aOwed) return bOwed - aOwed;
                                              if (bYtdOwed !== aYtdOwed) return bYtdOwed - aYtdOwed;
                                              return a.lastName.localeCompare(b.lastName);
                                            });

                                          // Bonus players: available but NOT in regular list (already met weekly quota)
                                          const regularIds = new Set(regularPlayers.map((p) => p.id));
                                          const skillOrder: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
                                          const bonusPlayers = bonusMode !== "off"
                                            ? allAvailable
                                                .filter((p) => {
                                                  if (regularIds.has(p.id)) return false;
                                                  if (p.contractedFrequency === "0") return false; // subs shown separately
                                                  if (bonusMode === "bonus") return p.contractedFrequency === "2+";
                                                  return true; // bonusAll — all available players
                                                })
                                                .sort((a, b) => {
                                                  const aSkill = skillOrder[a.skillLevel] ?? 9;
                                                  const bSkill = skillOrder[b.skillLevel] ?? 9;
                                                  if (aSkill !== bSkill) return aSkill - bSkill;
                                                  return a.lastName.localeCompare(b.lastName);
                                                })
                                            : [];

                                          // Sub players: contractedFrequency === "0", available, not already shown
                                          const subPlayers = allAvailable
                                            .filter((p) => {
                                              if (regularIds.has(p.id)) return false;
                                              return p.contractedFrequency === "0";
                                            })
                                            .sort((a, b) => {
                                              const aSkill = skillOrder[a.skillLevel] ?? 9;
                                              const bSkill = skillOrder[b.skillLevel] ?? 9;
                                              if (aSkill !== bSkill) return aSkill - bSkill;
                                              return a.lastName.localeCompare(b.lastName);
                                            });

                                          const renderPlayer = (p: Player, isBonus: boolean) => {
                                            const counts = playerCounts[p.id] ?? { wtd: 0, ytd: 0, ytdDons: 0, ytdSolo: 0, wtdDons: 0, wtdSolo: 0 };
                                            const freq = getEffectiveFreq(p, game.group);
                                            const groupWtd = game.group === "solo" ? counts.wtdSolo : counts.wtdDons;
                                            const remaining = freq - groupWtd;
                                            const deficit = hasYtdDeficit(p, game.group);
                                            const mustPlay = !isBonus && isMustPlay(p, game);
                                            return (
                                              <button
                                                key={p.id}
                                                onClick={() =>
                                                  handleAssignPlayer(game.id, slot, p.id)
                                                }
                                                className={`w-full text-left px-2 py-0.5 text-xs hover:bg-primary/10 transition-colors flex justify-between items-center ${
                                                  isBonus
                                                    ? "bg-green-50 border-l-3 border-l-green-500"
                                                    : mustPlay
                                                      ? "bg-red-50 border-l-3 border-l-red-500"
                                                      : remaining <= 0 && deficit
                                                        ? "bg-amber-50"
                                                        : ""
                                                }`}
                                              >
                                                <span>
                                                  {isBonus && (
                                                    <span className="text-green-600 font-bold mr-1" title="Bonus game">
                                                      BONUS
                                                    </span>
                                                  )}
                                                  {mustPlay && (
                                                    <span
                                                      className="text-red-600 font-bold mr-1"
                                                      title="Only playable day this week — must assign today"
                                                    >
                                                      MUST
                                                    </span>
                                                  )}
                                                  {p.isDerated && (
                                                    <span className="text-orange-500 font-bold mr-1" title="Derated player">D</span>
                                                  )}
                                                  {p.lastName}, {p.firstName}
                                                  {!isBonus && !mustPlay && remaining <= 0 && deficit && (
                                                    <span className="text-amber-600 ml-1" title="Behind on YTD — makeup game">*</span>
                                                  )}
                                                </span>
                                                <span className="flex gap-3 text-xs text-muted">
                                                  <span className={`w-8 text-center ${remaining < 0 ? "text-danger font-medium" : remaining === 0 ? "text-gray-400" : ""}`}>{remaining}</span>
                                                  <span className={`w-8 text-center ${deficit ? "text-amber-600 font-medium" : ""}`} title={`YTD Owed: ${freq * currentWeek} expected − ${game.group === "solo" ? counts.ytdSolo : counts.ytdDons} played`}>{freq * currentWeek - (game.group === "solo" ? counts.ytdSolo : counts.ytdDons)}</span>
                                                </span>
                                              </button>
                                            );
                                          };

                                          if (regularPlayers.length === 0 && bonusPlayers.length === 0 && subPlayers.length === 0) {
                                            return (
                                              <p className="text-xs text-muted p-3">
                                                No available players
                                              </p>
                                            );
                                          }

                                          return (
                                            <>
                                              {regularPlayers.map((p) => renderPlayer(p, false))}
                                              {bonusPlayers.length > 0 && (
                                                <>
                                                  {regularPlayers.length > 0 && (
                                                    <div className="border-t border-green-300 mx-2 my-1" />
                                                  )}
                                                  {bonusPlayers.map((p) => renderPlayer(p, true))}
                                                </>
                                              )}
                                            </>
                                          );
                                        })()}
                                      </div>
                                      {(() => {
                                        const allAvail = getAvailablePlayers(game);
                                        const assignedInDropdown = new Set([
                                          ...allAvail.filter((p) => p.contractedFrequency !== "0").map((p) => p.id),
                                        ]);
                                        const subs = allAvail
                                          .filter((p) => p.contractedFrequency === "0" && !assignedInDropdown.has(p.id))
                                          .sort((a, b) => a.lastName.localeCompare(b.lastName));
                                        if (subs.length === 0) return null;
                                        return (
                                          <div className="border-t border-purple-300">
                                            <div className="px-2 py-0.5 text-[10px] text-purple-600 font-semibold bg-purple-50">
                                              SUBS
                                            </div>
                                            <div className="max-h-32 overflow-y-auto">
                                              {subs.map((p) => (
                                                <button
                                                  key={p.id}
                                                  onClick={() =>
                                                    handleAssignPlayer(game.id, slot, p.id)
                                                  }
                                                  className="w-full text-left px-2 py-0.5 text-xs hover:bg-primary/10 transition-colors flex justify-between items-center bg-purple-50 border-l-3 border-l-purple-500"
                                                >
                                                  <span>
                                                    <span className="text-purple-600 font-bold mr-1">SUB</span>
                                                    {p.isDerated && (
                                                      <span className="text-orange-500 font-bold mr-1" title="Derated player">D</span>
                                                    )}
                                                    {p.lastName}, {p.firstName}
                                                  </span>
                                                  <span className="text-xs text-muted">{p.skillLevel}</span>
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      <div className="p-2 border-t border-border">
                                        <button
                                          onClick={() => {
                                            setActiveSlot(null);
                                          }}
                                          className="text-xs text-muted hover:underline"
                                        >
                                          Close
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {/* Extra Games Modal */}
      {showExtraGames && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-2xl w-[90vw] max-w-5xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold">Extra Games &mdash; Don&apos;s Group</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (extraGamesData && season) {
                      generateExtraGamesPdf(
                        extraGamesData.rows.map((r) => ({
                          playerName: r.playerName,
                          gameNumber: r.gameNumber,
                          date: r.date,
                          dayOfWeek: r.dayOfWeek,
                          players: r.players,
                        })),
                        season,
                        extraGamesData.currentMaxWeek
                      );
                    }
                  }}
                  disabled={!extraGamesData || extraGamesData.rows.length === 0}
                  className="bg-primary text-white px-4 py-1.5 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-40"
                >
                  PDF
                </button>
                <button
                  onClick={() => {
                    setShowExtraGames(false);
                    setExtraGamesData(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold px-2"
                >
                  &#10005;
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {extraGamesLoading ? (
                <p className="text-center text-muted py-8">Loading...</p>
              ) : !extraGamesData || extraGamesData.rows.length === 0 ? (
                <p className="text-center text-muted py-8">No extra games found.</p>
              ) : (() => {
                const sortedRows = [...extraGamesData.rows].sort((a, b) => a.gameNumber - b.gameNumber);

                return (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2 border-b border-border font-semibold w-[5%]">Wk</th>
                        <th className="px-3 py-2 border-b border-border font-semibold w-[13%]">Player</th>
                        <th className="px-3 py-2 border-b border-border font-semibold w-[6%]">Game #</th>
                        <th className="px-3 py-2 border-b border-border font-semibold w-[10%]">Date</th>
                        <th className="px-3 py-2 border-b border-border font-semibold w-[8%]">Day</th>
                        <th className="px-3 py-2 border-b border-border font-semibold w-[14%]">Player 1</th>
                        <th className="px-3 py-2 border-b border-border font-semibold w-[14%]">Player 2</th>
                        <th className="px-3 py-2 border-b border-border font-semibold w-[14%]">Player 3</th>
                        <th className="px-3 py-2 border-b border-border font-semibold w-[14%]">Player 4</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row) => (
                        <tr
                          key={`${row.playerId}-${row.gameId}`}
                          className="border-b border-gray-100"
                        >
                          <td className="px-3 py-1.5 text-muted">{row.weekNumber}</td>
                          <td className="px-3 py-1.5 font-medium">{row.playerName}</td>
                          <td className="px-3 py-1.5">{row.gameNumber}</td>
                          <td className="px-3 py-1.5">{formatDisplayDate(row.date)}</td>
                          <td className="px-3 py-1.5">{DAYS[row.dayOfWeek]}</td>
                          <td className="px-3 py-1.5">{row.players[0]}</td>
                          <td className="px-3 py-1.5">{row.players[1]}</td>
                          <td className="px-3 py-1.5">{row.players[2]}</td>
                          <td className="px-3 py-1.5">{row.players[3]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Footer */}
            {extraGamesData && extraGamesData.rows.length > 0 && (
              <div className="px-6 py-3 border-t border-border text-xs text-muted">
                {extraGamesData.rows.length} extra game{extraGamesData.rows.length !== 1 ? "s" : ""} found
                &middot; Through week {extraGamesData.currentMaxWeek} of 36
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
