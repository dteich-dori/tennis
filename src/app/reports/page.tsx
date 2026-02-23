"use client";

import { useState, useEffect, useCallback } from "react";
import { generatePlayersListPdf } from "@/lib/reports/playersListPdf";
import { generatePlayerStatsPdf } from "@/lib/reports/playerStatsPdf";
import { generateGamesByDatePdf, generateGamesByDateWorksheetPdf } from "@/lib/reports/gamesByDatePdf";
import { generatePairingMatrixPdf } from "@/lib/reports/pairingMatrixPdf";

interface Season {
  id: number;
  startDate: string;
  endDate: string;
  totalWeeks: number;
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

      generatePlayersListPdf(activePlayers, season);
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
      const data = (await res.json()) as { stats: unknown[]; currentMaxWeek: number };

      if (!data.stats || data.stats.length === 0) {
        setError("No player statistics available for this group.");
        setGenerating(null);
        return;
      }

      generatePlayerStatsPdf(data.stats as Parameters<typeof generatePlayerStatsPdf>[0], season, data.currentMaxWeek, group, season.totalWeeks ?? 36);
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
        generateGamesByDatePdf(allGames, allPlayers, season, gamesWeekStart, gamesWeekEnd);
      } else {
        generateGamesByDateWorksheetPdf(allGames, allPlayers, season, gamesWeekStart, gamesWeekEnd);
      }
    } catch {
      setError("Failed to generate Games By Date report.");
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
        players: { id: number; firstName: string; lastName: string; skillLevel: string }[];
        pairings: { player1Id: number; player2Id: number; count: number }[];
        doNotPairs: { playerId: number; pairedPlayerId: number }[];
      };

      if (!data.players || data.players.length === 0) {
        setError("No player pairing data available. Assign players to games first.");
        setGenerating(null);
        return;
      }

      generatePairingMatrixPdf(data.players, data.pairings, data.doNotPairs, season);
    } catch {
      setError("Failed to generate Pairing Matrix report.");
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

      <div className="flex flex-col gap-4 max-w-2xl">
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
          </div>
        </div>

        {/* Player Statistics Report Card */}
        <div className="border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
          <h2 className="font-semibold mb-2">Player Statistics</h2>
          <p className="text-sm text-muted mb-4">
            Games played YTD, contract info, ball-bringing counts.
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
          <button
            onClick={handlePairingMatrixReport}
            disabled={generating === "pairingMatrix"}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generating === "pairingMatrix" ? "Generating..." : "Generate PDF"}
          </button>
        </div>

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
      </div>
    </div>
  );
}
