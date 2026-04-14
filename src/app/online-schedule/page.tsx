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
  currentWeek: number;
  games: Game[];
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m.toString().padStart(2, "0")}/${d.toString().padStart(2, "0")}/${y}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function playerName(game: Game, pos: number): string {
  const p = game.players.find((pl) => pl.slotPosition === pos);
  return p ? `${p.lastName}, ${p.firstName.charAt(0)}.` : "\u2014";
}

export default function OnlineSchedule() {
  const router = useRouter();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>("");

  const fetchSchedule = useCallback((from?: string) => {
    setLoading(true);
    setError(null);
    const url = from
      ? `/api/public/schedule?from=${from}`
      : "/api/public/schedule";
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load schedule");
        return res.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFromDate(val);
    if (val) fetchSchedule(val);
  };

  const handleReset = () => {
    setFromDate("");
    fetchSchedule();
  };

  const isCustomDate = fromDate !== "";

  // Group games by week then by date
  const weekGroups = new Map<number, Map<string, Game[]>>();
  if (data?.games) {
    for (const g of data.games) {
      if (!weekGroups.has(g.weekNumber)) weekGroups.set(g.weekNumber, new Map());
      const dateMap = weekGroups.get(g.weekNumber)!;
      if (!dateMap.has(g.date)) dateMap.set(g.date, []);
      dateMap.get(g.date)!.push(g);
    }
  }

  const weeks = data
    ? [data.currentWeek, data.currentWeek + 1].filter((w) => weekGroups.has(w))
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Tennis Schedule</h1>
          <button
            onClick={() => router.push("/")}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-300 transition-colors"
          >
            Exit
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <label className="text-sm text-gray-600">
            Starting from:
            <input
              type="date"
              value={fromDate}
              onChange={handleDateChange}
              min={data?.seasonStart ?? undefined}
              max={data?.seasonEnd ?? undefined}
              className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </label>
          {isCustomDate && (
            <button
              onClick={handleReset}
              className="text-sm text-primary hover:underline"
            >
              Reset to today
            </button>
          )}
          {data && data.currentWeek > 0 && (
            <span className="text-sm text-gray-500">
              Week {data.currentWeek} &amp; {data.currentWeek + 1}
            </span>
          )}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-500">Loading schedule...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-red-600">{error}</p>
        </div>
      ) : !data || data.games.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-500">No games scheduled for this period.</p>
        </div>
      ) : (
        <div className="px-2 sm:px-4 py-4 overflow-x-auto">
          {weeks.map((weekNum) => {
            const dateMap = weekGroups.get(weekNum)!;
            const weekLabel =
              weekNum === data.currentWeek
                ? isCustomDate
                  ? `Week ${weekNum}`
                  : "This Week"
                : isCustomDate
                  ? `Week ${weekNum}`
                  : "Next Week";

            return (
              <div key={weekNum} className="mb-6">
                <h2 className="text-base font-semibold text-gray-800 mb-2 px-1">
                  {weekLabel}
                </h2>
                <table className="w-full border-collapse text-sm min-w-[640px]">
                  <thead>
                    <tr className="bg-gray-200 text-gray-700">
                      <th className="border border-gray-300 px-2 py-1.5 text-center w-[40px]">
                        #
                      </th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center w-[72px]">
                        Time
                      </th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center w-[32px]">
                        Ct
                      </th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center w-[52px]">
                        Group
                      </th>
                      <th className="border border-gray-300 px-2 py-1.5 text-left">
                        Player 1
                      </th>
                      <th className="border border-gray-300 px-2 py-1.5 text-left">
                        Player 2
                      </th>
                      <th className="border border-gray-300 px-2 py-1.5 text-left">
                        Player 3
                      </th>
                      <th className="border border-gray-300 px-2 py-1.5 text-left">
                        Player 4
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dateMap.entries()].map(([date, dayGames]) => {
                      const dayName = DAY_NAMES[dayGames[0].dayOfWeek];
                      return (
                        <DateGroup
                          key={date}
                          date={date}
                          dayName={dayName}
                          games={dayGames}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {weeks.length > 0 &&
            [data.currentWeek, data.currentWeek + 1]
              .filter((w) => !weekGroups.has(w))
              .map((w) => (
                <div key={w} className="mb-6">
                  <h2 className="text-base font-semibold text-gray-800 mb-2 px-1">
                    {w === data.currentWeek
                      ? isCustomDate
                        ? `Week ${w}`
                        : "This Week"
                      : isCustomDate
                        ? `Week ${w}`
                        : "Next Week"}
                  </h2>
                  <p className="text-sm text-gray-400 italic px-1">
                    No games scheduled.
                  </p>
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

function DateGroup({
  date,
  dayName,
  games,
}: {
  date: string;
  dayName: string;
  games: Game[];
}) {
  return (
    <>
      <tr>
        <td
          colSpan={8}
          className="bg-gray-100 border border-gray-300 px-2 py-1.5 font-semibold text-gray-700 text-sm"
        >
          {dayName} &mdash; {formatDateShort(date)}
        </td>
      </tr>
      {games.map((game, idx) => (
        <tr
          key={game.gameNumber}
          className={idx % 2 === 1 ? "bg-amber-50/40" : "bg-white"}
        >
          <td className="border border-gray-300 px-2 py-1 text-center text-gray-500">
            {game.gameNumber}
          </td>
          <td className="border border-gray-300 px-2 py-1 text-center whitespace-nowrap">
            {formatTime(game.startTime)}
          </td>
          <td className="border border-gray-300 px-2 py-1 text-center">
            {game.courtNumber}
          </td>
          <td className="border border-gray-300 px-2 py-1 text-center capitalize text-xs">
            {game.group === "dons" ? "Don's" : game.group}
          </td>
          <td className="border border-gray-300 px-2 py-1">
            {playerName(game, 1)}
          </td>
          <td className="border border-gray-300 px-2 py-1">
            {playerName(game, 2)}
          </td>
          <td className="border border-gray-300 px-2 py-1">
            {playerName(game, 3)}
          </td>
          <td className="border border-gray-300 px-2 py-1">
            {playerName(game, 4)}
          </td>
        </tr>
      ))}
    </>
  );
}
