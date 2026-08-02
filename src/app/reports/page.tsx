"use client";

import { useState, useEffect, useCallback } from "react";
import { generatePlayersListPdf } from "@/lib/reports/playersListPdf";
import { generatePlayerStatsPdf } from "@/lib/reports/playerStatsPdf";
import { generateGamesByDatePdf, generateGamesByDateWorksheetPdf, generateSoloGamesByDatePdf } from "@/lib/reports/gamesByDatePdf";
import { generatePairingMatrixPdf } from "@/lib/reports/pairingMatrixPdf";
import { generatePotentialPlayersPdf } from "@/lib/reports/potentialPlayersPdf";
import { generatePlayerAvailabilityPdf } from "@/lib/reports/playerAvailabilityPdf";
import { generateIncompleteGamesPdf, type IncompleteGameRow } from "@/lib/reports/incompleteGamesPdf";
import { generateCourtSchedulePdf } from "@/lib/reports/courtSchedulePdf";
import { generateGamesByPlayerPdf } from "@/lib/reports/gamesByPlayerPdf";
import { generateWeeklyGameCountsPdf } from "@/lib/reports/weeklyGameCountsPdf";
import { generateExceptionsPdf } from "@/lib/reports/exceptionsPdf";
import { generateCompositionPdf } from "@/lib/reports/compositionPdf";
import { generateCompositionByPlayerPdf } from "@/lib/reports/compositionByPlayerPdf";

interface Season {
  id: number;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  scheduleVersion?: number;
}

interface Player {
  id: number;
  firstName: string;
  lastName: string;
  cellNumber: string | null;
  homeNumber: string | null;
  email: string | null;
  isActive: boolean;
  contractedFrequency: string;
  skillLevel: string;
  blockedDays: number[];
}

interface GameAssignment {
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
  assignments: GameAssignment[];
}

export default function ReportsPage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [gamesWeekStart, setGamesWeekStart] = useState(1);
  const [gamesWeekEnd, setGamesWeekEnd] = useState(36);
  const [hideAColumns, setHideAColumns] = useState(false);
  const [activeTab, setActiveTab] = useState<"GAMES" | "ANALYSIS" | "PLAYERS" | "COURTS" | "COSTS">("GAMES");

  const loadSeason = useCallback(async () => {
    try {
      const res = await fetch("/api/seasons");
      const data = (await res.json()) as Season[];
      if (data.length > 0) {
        const s = data[data.length - 1];
        setSeason(s);
        setGamesWeekEnd(s.totalWeeks ?? 36);
      }
    } catch (err) {
      console.error("Failed to load season:", err);
    }
  }, []);

  useEffect(() => {
    loadSeason();
  }, [loadSeason]);

  const handlePlayersListReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("playersList");

    try {
      const res = await fetch(`/api/players?seasonId=${season.id}`);
      if (!res.ok) {
        setError("Failed to load players data.");
        setGenerating(null);
        return;
      }
      const players = (await res.json()) as Player[];
      const activePlayers = players.filter((p) => p.isActive);

      if (activePlayers.length === 0) {
        setError("No active players found.");
        setGenerating(null);
        return;
      }

      generatePlayersListPdf(activePlayers, season, season.scheduleVersion);
    } catch {
      setError("Failed to generate Players List report.");
    }

    setGenerating(null);
  };

  const handlePlayerStatsReport = async (group: "dons" | "solo") => {
    if (!season) return;
    setError("");
    setGenerating(`playerStats-${group}`);

    try {
      const res = await fetch(`/api/games/stats?seasonId=${season.id}&group=${group}`);
      if (!res.ok) {
        setError("Failed to load player statistics.");
        setGenerating(null);
        return;
      }
      const data = (await res.json()) as { stats: unknown[]; currentMaxWeek: number; incompleteGameCount?: number };

      if (!data.stats || data.stats.length === 0) {
        setError("No player statistics available for this group.");
        setGenerating(null);
        return;
      }

      generatePlayerStatsPdf(data.stats as Parameters<typeof generatePlayerStatsPdf>[0], season, data.currentMaxWeek, group, season.totalWeeks ?? 36, data.incompleteGameCount ?? 0, season.scheduleVersion);
    } catch {
      setError("Failed to generate Player Statistics report.");
    }

    setGenerating(null);
  };

  const handleGamesByDateReport = async (variant: "compact" | "worksheet") => {
    if (!season) return;
    setError("");
    setGenerating(`gamesByDate-${variant}`);

    try {
      // Fetch all games for the season (with assignments)
      const gamesRes = await fetch(`/api/games?seasonId=${season.id}`);
      if (!gamesRes.ok) {
        setError("Failed to load games data.");
        setGenerating(null);
        return;
      }
      const allGames = (await gamesRes.json()) as Game[];

      if (allGames.length === 0) {
        setError("No games found. Generate games first.");
        setGenerating(null);
        return;
      }

      // Fetch players for name resolution
      const playersRes = await fetch(`/api/players?seasonId=${season.id}`);
      if (!playersRes.ok) {
        setError("Failed to load players data.");
        setGenerating(null);
        return;
      }
      const allPlayers = (await playersRes.json()) as Player[];

      if (variant === "compact") {
        generateGamesByDatePdf(allGames, allPlayers, season, gamesWeekStart, gamesWeekEnd, season.scheduleVersion);
      } else {
        generateGamesByDateWorksheetPdf(allGames, allPlayers, season, gamesWeekStart, gamesWeekEnd, season.scheduleVersion);
      }
    } catch {
      setError("Failed to generate Games By Date report.");
    }

    setGenerating(null);
  };

  const handleExceptionsReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("exceptions");

    try {
      const [gamesRes, playersRes] = await Promise.all([
        fetch(`/api/games?seasonId=${season.id}`),
        fetch(`/api/players?seasonId=${season.id}`),
      ]);
      if (!gamesRes.ok || !playersRes.ok) {
        setError("Failed to load data for exceptions report.");
        setGenerating(null);
        return;
      }
      const allGames = (await gamesRes.json()) as Game[];
      const allPlayers = (await playersRes.json()) as Player[];

      // Run compliance checks across all weeks
      const totalWeeks = season.totalWeeks ?? 36;
      const allViolations: { rule: string; severity: "error" | "warning"; gameId: number; gameNumber: number; date: string; playerName: string; detail: string }[] = [];
      for (let wk = 1; wk <= totalWeeks; wk++) {
        try {
          const res = await fetch(`/api/games/compliance?seasonId=${season.id}&weekNumber=${wk}&group=dons`);
          if (res.ok) {
            const data = await res.json();
            if (data.violations) {
              // Only keep game-level violations (gameId > 0)
              allViolations.push(...data.violations.filter((v: { gameId: number }) => v.gameId > 0));
            }
          }
        } catch {
          // skip week on error
        }
      }

      // Also detect game-level issues directly from game data.
      // Weeks > 36 are makeup weeks (beyond the contract obligation);
      // incompleteness there is expected/flexible, so skip them.
      const playerMap = new Map(allPlayers.map((p) => [p.id, p]));
      const donsGames = allGames.filter((g) => g.group === "dons" && g.status === "normal" && g.weekNumber <= 36);
      for (const g of donsGames) {
        const count = g.assignments?.length ?? 0;

        // Incomplete games
        if (count < 4 && count > 0) {
          allViolations.push({
            rule: "Incomplete",
            severity: "error",
            gameId: g.id,
            gameNumber: g.gameNumber,
            date: g.date,
            playerName: "",
            detail: `${count}/4 players assigned (${4 - count} open slot${4 - count > 1 ? "s" : ""})`,
          });
        }

        // Composition violations: any A+C combo other than AACC.
        // Policy v1.127: AACC (2A + 2C + 0B) is allowed; AAAC, AABC, ABBC,
        // ABCC, ACCC are not.
        if (count === 4) {
          const levels = g.assignments.map((a: { playerId: number }) => playerMap.get(a.playerId)?.skillLevel ?? "B");
          const aCount = levels.filter((l: string) => l === "A").length;
          const bCount = levels.filter((l: string) => l === "B").length;
          const cCount = levels.filter((l: string) => l === "C").length;
          const isAACC = aCount === 2 && bCount === 0 && cCount === 2;
          if (aCount > 0 && cCount > 0 && !isAACC) {
            const composition = levels.sort().join("");
            allViolations.push({
              rule: "Composition",
              severity: "error",
              gameId: g.id,
              gameNumber: g.gameNumber,
              date: g.date,
              playerName: "",
              detail: `A+C combo not allowed (${composition}). Only AACC is permitted.`,
            });
          }
        }
      }

      if (allViolations.length === 0) {
        setError("No exceptions found — all games pass compliance checks.");
        setGenerating(null);
        return;
      }

      generateExceptionsPdf(allGames, allPlayers, allViolations, season, totalWeeks, season.scheduleVersion);
    } catch {
      setError("Failed to generate exceptions report.");
    }

    setGenerating(null);
  };

  const handleRenumberGames = async () => {
    if (!season) return;
    setError("");
    setGenerating("renumber");

    try {
      const res = await fetch(`/api/games/renumber?seasonId=${season.id}`, { method: "POST" });
      if (!res.ok) {
        setError("Failed to renumber games.");
        setGenerating(null);
        return;
      }
      const data = (await res.json()) as { totalGames: number };
      setError(`Games renumbered successfully (${data.totalGames} games).`);
    } catch {
      setError("Failed to renumber games.");
    }

    setGenerating(null);
  };

  const handleSoloGamesByDateReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("soloByDate");

    try {
      const [gamesRes, playersRes] = await Promise.all([
        fetch(`/api/games?seasonId=${season.id}`),
        fetch(`/api/players?seasonId=${season.id}`),
      ]);

      if (!gamesRes.ok || !playersRes.ok) {
        setError("Failed to load data for Solo Games By Date report.");
        setGenerating(null);
        return;
      }

      const allGames = (await gamesRes.json()) as Game[];
      const allPlayers = (await playersRes.json()) as Player[];

      const soloGames = allGames.filter((g) => g.group === "solo");
      if (soloGames.length === 0) {
        setError("No solo games found.");
        setGenerating(null);
        return;
      }

      generateSoloGamesByDatePdf(allGames, allPlayers, season, season.scheduleVersion);
    } catch {
      setError("Failed to generate Solo Games By Date report.");
    }

    setGenerating(null);
  };

  const handlePairingMatrixReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("pairingMatrix");

    try {
      const res = await fetch(`/api/games/pairings?seasonId=${season.id}`);
      if (!res.ok) {
        setError("Failed to load pairing data.");
        setGenerating(null);
        return;
      }
      const data = (await res.json()) as {
        players: { id: number; firstName: string; lastName: string; skillLevel: string; contractedFrequency: string }[];
        pairings: { player1Id: number; player2Id: number; count: number }[];
        doNotPairs: { playerId: number; pairedPlayerId: number }[];
      };

      if (!data.players || data.players.length === 0) {
        setError("No player pairing data available. Assign players to games first.");
        setGenerating(null);
        return;
      }

      generatePairingMatrixPdf(data.players, data.pairings, data.doNotPairs, season, season.scheduleVersion, hideAColumns);
    } catch {
      setError("Failed to generate Pairing Matrix report.");
    }

    setGenerating(null);
  };

  const handlePlayerAvailabilityReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("playerAvailability");
    try {
      const res = await fetch(`/api/players?seasonId=${season.id}`);
      if (!res.ok) {
        setError("Failed to load players data.");
        setGenerating(null);
        return;
      }
      const players = (await res.json()) as (Player & {
        isActive: boolean;
        skillLevel: string;
        contractedFrequency: string;
        excludedFromAutoAssign?: boolean;
        vacations: { startDate: string; endDate: string }[];
      })[];
      if (players.length === 0) {
        setError("No players found.");
        setGenerating(null);
        return;
      }
      generatePlayerAvailabilityPdf(
        players,
        season,
        season.scheduleVersion
      );
    } catch {
      setError("Failed to generate Player Availability report.");
    }
    setGenerating(null);
  };

  const handleIncompleteGamesReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("incompleteGames");
    try {
      const [playersRes, gamesRes, cappedRes] = await Promise.all([
        fetch(`/api/players?seasonId=${season.id}`),
        fetch(`/api/games?seasonId=${season.id}`),
        fetch(`/api/games/capped-slots?seasonId=${season.id}`),
      ]);
      if (!playersRes.ok || !gamesRes.ok) {
        setError("Failed to load games or players.");
        setGenerating(null);
        return;
      }
      const players = (await playersRes.json()) as {
        id: number;
        firstName: string;
        lastName: string;
        skillLevel: string;
      }[];
      const games = (await gamesRes.json()) as {
        id: number;
        gameNumber: number;
        weekNumber: number;
        date: string;
        dayOfWeek: number;
        startTime: string;
        courtNumber: number;
        group: "dons" | "solo";
        status: string;
        assignments: { id: number; gameId: number; playerId: number; slotPosition: number }[];
      }[];
      const capped = cappedRes.ok
        ? ((await cappedRes.json()) as Record<string, number[]>)
        : {};

      const playerById = new Map(players.map((p) => [p.id, p]));
      const rows: IncompleteGameRow[] = games
        .filter((g) => g.status === "normal" && g.assignments.length < 4)
        .map((g) => ({
          weekNumber: g.weekNumber,
          gameNumber: g.gameNumber,
          date: g.date,
          dayOfWeek: g.dayOfWeek,
          startTime: g.startTime,
          courtNumber: g.courtNumber,
          group: g.group,
          assigned: g.assignments
            .map((a) => {
              const p = playerById.get(a.playerId);
              return p
                ? {
                    slot: a.slotPosition,
                    lastName: p.lastName,
                    firstName: p.firstName,
                    skillLevel: p.skillLevel,
                  }
                : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => a.slot - b.slot),
          cappedSlots: capped[String(g.id)] ?? [],
        }));

      generateIncompleteGamesPdf(rows, season, season.scheduleVersion);
    } catch {
      setError("Failed to generate Incomplete Games report.");
    }
    setGenerating(null);
  };

  const handlePotentialPlayersReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("potentialPlayers");

    try {
      const [playersRes, courtsRes] = await Promise.all([
        fetch(`/api/players?seasonId=${season.id}`),
        fetch(`/api/courts?seasonId=${season.id}`),
      ]);

      if (!playersRes.ok) {
        setError("Failed to load players data.");
        setGenerating(null);
        return;
      }
      const players = (await playersRes.json()) as Player[];
      const activePlayers = players.filter((p) => p.isActive);

      if (activePlayers.length === 0) {
        setError("No active players found.");
        setGenerating(null);
        return;
      }

      const courtSlots = courtsRes.ok
        ? ((await courtsRes.json()) as { dayOfWeek: number; isSolo: boolean }[])
        : [];

      generatePotentialPlayersPdf(activePlayers, season, courtSlots, season.scheduleVersion);
    } catch {
      setError("Failed to generate Player List Internal report.");
    }

    setGenerating(null);
  };

  const handleCourtScheduleReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("courtSchedule");

    try {
      const res = await fetch(`/api/courts?seasonId=${season.id}`);
      if (!res.ok) {
        setError("Failed to load court schedule data.");
        setGenerating(null);
        return;
      }
      const courts = (await res.json()) as { id: number; dayOfWeek: number; courtNumber: number; startTime: string; isSolo: boolean }[];

      if (courts.length === 0) {
        setError("No court schedules found for this season.");
        setGenerating(null);
        return;
      }

      generateCourtSchedulePdf(courts, season, season.scheduleVersion);
    } catch {
      setError("Failed to generate Court Schedule report.");
    }

    setGenerating(null);
  };

  const handleGamesByPlayerReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("gamesByPlayer");

    try {
      const [gamesRes, playersRes] = await Promise.all([
        fetch(`/api/games?seasonId=${season.id}`),
        fetch(`/api/players?seasonId=${season.id}`),
      ]);

      if (!gamesRes.ok || !playersRes.ok) {
        setError("Failed to load data for Games By Player report.");
        setGenerating(null);
        return;
      }

      const allGames = (await gamesRes.json()) as { id: number; gameNumber: number; seasonId: number; weekNumber: number; date: string; dayOfWeek: number; startTime: string; courtNumber: number; group: string; status: string; holidayName?: string; assignments: { id: number; gameId: number; playerId: number; slotPosition: number; isPrefill: boolean }[] }[];
      const allPlayers = (await playersRes.json()) as { id: number; firstName: string; lastName: string; contractedFrequency: string; skillLevel: string; isActive: boolean }[];

      const activePlayers = allPlayers.filter((p) => p.isActive);
      const normalGames = allGames.filter((g) => g.status === "normal");

      const hasAssignments = normalGames.some((g) => g.assignments.length > 0);
      if (!hasAssignments) {
        setError("No player game assignments found. Assign players to games first.");
        setGenerating(null);
        return;
      }

      generateGamesByPlayerPdf(activePlayers, allPlayers, normalGames, season, season.scheduleVersion);
    } catch {
      setError("Failed to generate Games By Player report.");
    }

    setGenerating(null);
  };

  const handleWeeklyGameCountsReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("weeklyGameCounts");

    try {
      const [gamesRes, playersRes] = await Promise.all([
        fetch(`/api/games?seasonId=${season.id}`),
        fetch(`/api/players?seasonId=${season.id}`),
      ]);

      if (!gamesRes.ok || !playersRes.ok) {
        setError("Failed to load data for Weekly Game Counts report.");
        setGenerating(null);
        return;
      }

      const allGames = (await gamesRes.json()) as {
        weekNumber: number;
        status: string;
        group: string;
        assignments: { playerId: number }[];
      }[];
      const allPlayers = (await playersRes.json()) as {
        id: number;
        firstName: string;
        lastName: string;
        contractedFrequency: string;
        isActive: boolean;
        excludedFromAutoAssign?: boolean;
      }[];

      const hasAssignments = allGames.some(
        (g) => g.status === "normal" && g.group === "dons" && g.assignments.length > 0
      );
      if (!hasAssignments) {
        setError("No Don's-group assignments found. Assign players to games first.");
        setGenerating(null);
        return;
      }

      generateWeeklyGameCountsPdf(allPlayers, allGames, season, season.scheduleVersion);
    } catch {
      setError("Failed to generate Weekly Game Counts report.");
    }

    setGenerating(null);
  };

  const handleCompositionReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("composition");

    try {
      const res = await fetch(`/api/games/composition?seasonId=${season.id}`);
      if (!res.ok) {
        setError("Failed to load composition data.");
        setGenerating(null);
        return;
      }
      const data = await res.json();

      if (!data.compositions || data.totalGames === 0) {
        setError("No complete games found for composition analysis. Assign players to games first.");
        setGenerating(null);
        return;
      }

      generateCompositionPdf(data, season.scheduleVersion);
    } catch {
      setError("Failed to generate Composition Analysis report.");
    }

    setGenerating(null);
  };

  const handleCompositionByPlayerReport = async () => {
    if (!season) return;
    setError("");
    setGenerating("compositionByPlayer");

    try {
      const res = await fetch(`/api/games/composition-by-player?seasonId=${season.id}`);
      if (!res.ok) {
        setError("Failed to load composition-by-player data.");
        setGenerating(null);
        return;
      }
      const data = await res.json();

      if (!data.rows || data.rows.length === 0) {
        setError("No player data available. Assign players to games first.");
        setGenerating(null);
        return;
      }

      generateCompositionByPlayerPdf(
        data.compositions,
        data.rows,
        season,
        season.scheduleVersion,
        data.incompleteGames ?? 0,
        data.incompleteSlots ?? 0,
        data.incompleteGameRows ?? []
      );
    } catch {
      setError("Failed to generate Game-Level Distribution report.");
    }

    setGenerating(null);
  };

  if (!season) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Reports</h1>
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

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <span className="text-sm text-muted">
          Season {startYear} - {endYear}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-danger rounded px-4 py-2 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-1 border-b border-border mb-4">
        {(["GAMES", "ANALYSIS", "PLAYERS", "COURTS", "COSTS"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 max-w-2xl">
        {activeTab === "GAMES" && (
        <>
        {/* Games By Date Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Games By Date</h2>
          <p className="text-sm text-muted mb-3">
            Game schedule with player assignments. Choose compact (2 weeks/page) or worksheet (1 week/page with write-in space).
          </p>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs text-muted">Weeks:</label>
            <select
              value={gamesWeekStart}
              onChange={(e) => setGamesWeekStart(parseInt(e.target.value))}
              className="border border-border rounded px-2 py-1 text-xs w-14"
            >
              {Array.from({ length: season?.totalWeeks ?? 36 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <span className="text-xs text-muted">to</span>
            <select
              value={gamesWeekEnd}
              onChange={(e) => setGamesWeekEnd(parseInt(e.target.value))}
              className="border border-border rounded px-2 py-1 text-xs w-14"
            >
              {Array.from({ length: season?.totalWeeks ?? 36 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleGamesByDateReport("compact")}
              disabled={generating?.startsWith("gamesByDate") ?? false}
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {generating === "gamesByDate-compact" ? "Generating..." : "Compact"}
            </button>
            <button
              onClick={() => handleGamesByDateReport("worksheet")}
              disabled={generating?.startsWith("gamesByDate") ?? false}
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {generating === "gamesByDate-worksheet" ? "Generating..." : "Worksheet"}
            </button>
            <button
              onClick={handleRenumberGames}
              disabled={generating === "renumber"}
              className="border border-border text-sm px-4 py-2 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
              title="Reassign game numbers sequentially by date and time, filling any gaps from deleted games"
            >
              {generating === "renumber" ? "Renumbering..." : "Renumber"}
            </button>
            <button
              onClick={handleSoloGamesByDateReport}
              disabled={generating === "soloByDate"}
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {generating === "soloByDate" ? "Generating..." : "Solo Only"}
            </button>
            <button
              onClick={handleExceptionsReport}
              disabled={generating === "exceptions"}
              className="bg-orange-500 text-white px-4 py-2 rounded text-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
              title="Games with compliance violations — incomplete, DNP, composition, vacation conflicts, etc."
            >
              {generating === "exceptions" ? "Checking..." : "Exceptions"}
            </button>
          </div>
        </div>

        {/* Games By Player Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Games By Player</h2>
          <p className="text-sm text-muted mb-4">
            Per-player listing of all game assignments with date, time, court, and co-players.
          </p>
          <button
            onClick={handleGamesByPlayerReport}
            disabled={generating === "gamesByPlayer"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "gamesByPlayer" ? "Generating..." : "Generate PDF"}
          </button>
        </div>

        {/* Weekly Game Counts Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Weekly Game Counts</h2>
          <p className="text-sm text-muted mb-4">
            Matrix of players (rows) × weeks (columns). Each cell shows how many Don&apos;s-group games that player was assigned in that week, plus a season total per player.
          </p>
          <button
            onClick={handleWeeklyGameCountsReport}
            disabled={generating === "weeklyGameCounts"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "weeklyGameCounts" ? "Generating..." : "Generate PDF"}
          </button>
        </div>
        </>
        )}

        {activeTab === "ANALYSIS" && (
        <>
        {/* Player Statistics Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Player Statistics</h2>
          <p className="text-sm text-muted mb-4">
            Games played STD (season total), contract info, ball-bringing counts.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePlayerStatsReport("dons")}
              disabled={generating?.startsWith("playerStats") ?? false}
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {generating === "playerStats-dons" ? "Generating..." : "Don's Group"}
            </button>
            <button
              onClick={() => handlePlayerStatsReport("solo")}
              disabled={generating?.startsWith("playerStats") ?? false}
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {generating === "playerStats-solo" ? "Generating..." : "Solo Group"}
            </button>
          </div>
        </div>

        {/* Pairing Matrix Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Pairing Matrix</h2>
          <p className="text-sm text-muted mb-4">
            Shows how many Don&apos;s group games each player shared with every other player. Do-not-pair violations highlighted in red.
          </p>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input
              type="checkbox"
              checked={hideAColumns}
              onChange={(e) => setHideAColumns(e.target.checked)}
            />
            Hide A-level columns (declutter — A rows still show A+C pairing)
          </label>
          <button
            onClick={handlePairingMatrixReport}
            disabled={generating === "pairingMatrix"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "pairingMatrix" ? "Generating..." : "Generate PDF"}
          </button>
        </div>

        {/* Composition Analysis Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Composition Analysis</h2>
          <p className="text-sm text-muted mb-4">
            Skill-level composition of all completed games (e.g. AAAB, AABB). Includes A+C combination detail.
          </p>
          <button
            onClick={handleCompositionReport}
            disabled={generating === "composition"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "composition" ? "Generating..." : "Generate PDF"}
          </button>
        </div>

        {/* Composition By Player Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Game-Level Distribution</h2>
          <p className="text-sm text-muted mb-4">
            For each player, how many completed games fall into each skill-level composition (AAAA, BBBB, AABC, etc.).
          </p>
          <button
            onClick={handleCompositionByPlayerReport}
            disabled={generating === "compositionByPlayer"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "compositionByPlayer" ? "Generating..." : "Generate PDF"}
          </button>
        </div>
        </>
        )}

        {activeTab === "PLAYERS" && (
        <>
        {/* Players List Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Players List</h2>
          <p className="text-sm text-muted mb-4">
            Active contract players and substitutes with contact information.
          </p>
          <button
            onClick={handlePlayersListReport}
            disabled={generating === "playersList"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "playersList" ? "Generating..." : "Generate PDF"}
          </button>
        </div>

        {/* Player List Internal Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Player List Internal Report</h2>
          <p className="text-sm text-muted mb-4">
            All players and subs with skill level, contract type, and blocked days for next season planning.
          </p>
          <button
            onClick={handlePotentialPlayersReport}
            disabled={generating === "potentialPlayers"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "potentialPlayers" ? "Generating..." : "Generate PDF"}
          </button>
        </div>

        {/* Player Availability Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Player Availability</h2>
          <p className="text-sm text-muted mb-4">
            Active players with the days of the week they can play and their vacation date ranges.
          </p>
          <button
            onClick={handlePlayerAvailabilityReport}
            disabled={generating === "playerAvailability"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "playerAvailability" ? "Generating..." : "Generate PDF"}
          </button>
        </div>
        </>
        )}

        {activeTab === "ANALYSIS" && (
        <>
        {/* C-Slot Diagnosis Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">C-Slot Diagnosis</h2>
          <p className="text-sm text-muted mb-4">
            For every incomplete Don&apos;s game involving C players,
            walks every eligible A/B candidate and shows which rule blocked
            them (per-player season C-games cap, Allowed Compositions grid,
            DNP, vacation, blocked day). Use to tune each player&apos;s Max
            C-games / season, or the Season Setup composition grid.
          </p>
          <a
            href="/reports/c-slots"
            className="inline-block bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
          >
            Open Diagnostic
          </a>
        </div>

        {/* Incomplete Games Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Incomplete Games</h2>
          <p className="text-sm text-muted mb-4">
            All games with fewer than 4 assigned players. Shows week,
            game number, court/time, assigned players (2 per line), and
            the reason the game wasn&apos;t fully assigned (cap-blocked
            vs. no eligible candidates).
          </p>
          <button
            onClick={handleIncompleteGamesReport}
            disabled={generating === "incompleteGames"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "incompleteGames" ? "Generating..." : "Generate PDF"}
          </button>
        </div>
        </>
        )}

        {activeTab === "COSTS" && (
        <>
        {/* Twilio SMS Cost Estimate Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Twilio SMS Cost Estimate</h2>
          <p className="text-sm text-muted mb-4">
            Estimate accrued and projected Twilio cost: setup, monthly,
            and per-message fees based on actual SMS sends this season.
          </p>
          <a
            href="/twilio-cost"
            className="inline-block bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
          >
            Open Estimator
          </a>
        </div>
        </>
        )}

        {activeTab === "COURTS" && (
        <>
        {/* Court Schedule Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Court Schedule</h2>
          <p className="text-sm text-muted mb-4">
            Weekly court layout showing days, times, court numbers, and group assignments (Dons / Solo).
          </p>
          <button
            onClick={handleCourtScheduleReport}
            disabled={generating === "courtSchedule"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "courtSchedule" ? "Generating..." : "Generate PDF"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
