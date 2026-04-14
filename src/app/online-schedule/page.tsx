"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface PlayerSlot {
  slotPosition: number;
  firstName: string;
  lastName: string;
}

interface Game {
  gameNumber: number;
  date: string;
  weekNumber: number;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  group: string;
  players: PlayerSlot[];
}

interface ScheduleData {
  seasonStart: string | null;
  seasonEnd: string | null;
  week: number;
  totalWeeks: number;
  games: Game[];
}

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDateCompact(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "p" : "a";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, "0")}${ampm}`;
}

function playerName(game: Game, pos: number): string {
  const p = game.players.find((pl) => pl.slotPosition === pos);
  if (!p) return "\u2014";
  return p.lastName;
}

export default function OnlineSchedule() {
  const router = useRouter();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<number | null>(null);

  const fetchSchedule = useCallback((w?: number) => {
    setLoading(true);
    setError(null);
    const url =
      w != null ? `/api/public/schedule?week=${w}` : "/api/public/schedule";
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load schedule");
        return res.json();
      })
      .then((d: ScheduleData) => {
        setData(d);
        setWeek(d.week);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const goPrev = () => {
    if (week != null && week > 1) {
      const w = week - 1;
      setWeek(w);
      fetchSchedule(w);
    }
  };

  const goNext = () => {
    if (week != null && data && week < data.totalWeeks) {
      const w = week + 1;
      setWeek(w);
      fetchSchedule(w);
    }
  };

  // Compute the Monday date for the displayed week
  let weekMonday = "";
  if (data?.seasonStart && week) {
    const start = new Date(data.seasonStart + "T00:00:00");
    const mon = new Date(start.getTime() + (week - 1) * 7 * 86400000);
    const m = mon.getMonth() + 1;
    const d = mon.getDate();
    weekMonday = `${m}/${d}`;
  }

  // Group games by date
  const byDate = new Map<string, Game[]>();
  if (data?.games) {
    for (const g of data.games) {
      if (!byDate.has(g.date)) byDate.set(g.date, []);
      byDate.get(g.date)!.push(g);
    }
  }

  const canPrev = week != null && week > 1;
  const canNext = week != null && data != null && week < data.totalWeeks;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-3 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-300"
          >
            Exit
          </button>
          <span className="text-base font-bold text-gray-900">
            Brooklake Don&apos;s Group 2026-2027 Games
          </span>
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={goPrev}
            disabled={!canPrev}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default"
            aria-label="Previous week"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 15l-5-5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">
            Week {week ?? "..."}{weekMonday ? ` (${weekMonday})` : ""}
          </span>
          <button
            onClick={goNext}
            disabled={!canNext}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default"
            aria-label="Next week"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      ) : !data || data.games.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">No games this week.</p>
        </div>
      ) : (
        <div className="px-1 py-2 overflow-x-auto">
          <table className="border-collapse text-xs w-auto">
            <thead>
              <tr className="bg-gray-200 text-gray-700">
                <th className="border border-gray-300 px-1 py-1 text-center">#</th>
                <th className="border border-gray-300 px-1 py-1 text-center">Time</th>
                <th className="border border-gray-300 px-1 py-1 text-center">Ct</th>
                <th className="border border-gray-300 px-1.5 py-1 text-left">Player 1</th>
                <th className="border border-gray-300 px-1.5 py-1 text-left">Player 2</th>
                <th className="border border-gray-300 px-1.5 py-1 text-left">Player 3</th>
                <th className="border border-gray-300 px-1.5 py-1 text-left">Player 4</th>
              </tr>
            </thead>
            <tbody>
              {[...byDate.entries()].map(([date, dayGames]) => (
                <DateGroup
                  key={date}
                  date={date}
                  dayAbbr={DAY_ABBR[dayGames[0].dayOfWeek]}
                  games={dayGames}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DateGroup({
  date,
  dayAbbr,
  games,
}: {
  date: string;
  dayAbbr: string;
  games: Game[];
}) {
  return (
    <>
      <tr>
        <td
          colSpan={7}
          className="bg-gray-100 border border-gray-300 px-1.5 py-1 font-semibold text-gray-700 text-xs"
        >
          {dayAbbr} {formatDateCompact(date)}
        </td>
      </tr>
      {games.map((game, idx) => (
        <tr
          key={game.gameNumber}
          className={idx % 2 === 1 ? "bg-amber-50/40" : "bg-white"}
        >
          <td className="border border-gray-300 px-1 py-0.5 text-center text-gray-400">
            {game.gameNumber}
          </td>
          <td className="border border-gray-300 px-1 py-0.5 text-center whitespace-nowrap">
            {formatTime(game.startTime)}
          </td>
          <td className="border border-gray-300 px-1 py-0.5 text-center">
            {game.courtNumber}
          </td>
          <td className="border border-gray-300 px-1.5 py-0.5 whitespace-nowrap">
            {playerName(game, 1)}
          </td>
          <td className="border border-gray-300 px-1.5 py-0.5 whitespace-nowrap">
            {playerName(game, 2)}
          </td>
          <td className="border border-gray-300 px-1.5 py-0.5 whitespace-nowrap">
            {playerName(game, 3)}
          </td>
          <td className="border border-gray-300 px-1.5 py-0.5 whitespace-nowrap">
            {playerName(game, 4)}
          </td>
        </tr>
      ))}
    </>
  );
}
