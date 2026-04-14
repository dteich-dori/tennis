"use client";

import { useState, useEffect } from "react";

interface PlayerSlot {
  slotPosition: number;
  firstName: string;
  lastName: string;
}

interface Game {
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

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export default function PlayerSchedule() {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/schedule")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load schedule");
        return res.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading schedule...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!data || data.games.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">No games scheduled for this period.</p>
      </div>
    );
  }

  // Split games into this week and next week
  const thisWeekGames = data.games.filter(
    (g) => g.weekNumber === data.currentWeek
  );
  const nextWeekGames = data.games.filter(
    (g) => g.weekNumber === data.currentWeek + 1
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4 sm:px-6">
        <h1 className="text-xl font-bold text-gray-900">
          Tennis Schedule
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Week {data.currentWeek} &amp; {data.currentWeek + 1}
        </p>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 space-y-8">
        <WeekSection title="This Week" games={thisWeekGames} />
        <WeekSection title="Next Week" games={nextWeekGames} />
      </div>
    </div>
  );
}

function WeekSection({ title, games }: { title: string; games: Game[] }) {
  if (games.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>
        <p className="text-sm text-gray-400 italic">No games scheduled.</p>
      </section>
    );
  }

  // Group by date
  const byDate = new Map<string, Game[]>();
  for (const g of games) {
    const existing = byDate.get(g.date) ?? [];
    existing.push(g);
    byDate.set(g.date, existing);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>
      <div className="space-y-4">
        {[...byDate.entries()].map(([date, dayGames]) => (
          <DayGroup key={date} date={date} games={dayGames} />
        ))}
      </div>
    </section>
  );
}

function DayGroup({ date, games }: { date: string; games: Game[] }) {
  const dayName = DAY_NAMES[games[0].dayOfWeek];

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-600 mb-2">
        {dayName}, {formatDate(date)}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {games.map((game, i) => (
          <GameCard key={i} game={game} />
        ))}
      </div>
    </div>
  );
}

function GameCard({ game }: { game: Game }) {
  const slots = [1, 2, 3, 4].map((pos) => {
    const p = game.players.find((pl) => pl.slotPosition === pos);
    return p ? `${p.firstName} ${p.lastName}` : null;
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-900">
          {formatTime(game.startTime)} &middot; Court {game.courtNumber}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">
          {game.group}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {slots.map((name, i) => (
          <span
            key={i}
            className={`text-sm truncate ${
              name ? "text-gray-800" : "text-gray-300 italic"
            }`}
          >
            {name ?? "Open"}
          </span>
        ))}
      </div>
    </div>
  );
}
