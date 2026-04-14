"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { APP_VERSION } from "@/lib/version";

interface Player {
  id: number;
  name: string;
  email: string | null;
  isActive: boolean;
}

interface Signup {
  id: number;
  playerId: number;
  playerName: string;
  signedUpAt: string;
}

interface GameSlot {
  id: number;
  date: string;
  courtNumber: number;
  timeSlot: string;
  maxPlayers: number;
  isLocked: boolean;
  reservedCourt: string | null;
  isOverflow: boolean;
  signups: Signup[];
}

interface Notification {
  id: number;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface Settings {
  clubName: string;
  courtsAvailable: number;
  defaultTimeSlot: string;
  playersPerGame: number;
  creatorPlayerId: number | null;
  maintainerPlayerId: number | null;
  startDate: string | null;
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [gameSlots, setGameSlots] = useState<GameSlot[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editingTimeKey, setEditingTimeKey] = useState<string | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState("");
  const [recentlyJoined, setRecentlyJoined] = useState<Set<number>>(new Set());
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [resetDelay, setResetDelay] = useState(30);
  const [resetCountdown, setResetCountdown] = useState<number | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPlayers = useCallback(async () => {
    const res = await fetch("/api/players");
    const data = await res.json();
    setPlayers(data.filter((p: Player) => p.isActive));
  }, []);

  const fetchGameSlots = useCallback(async () => {
    const fromStr = settings?.startDate || new Date().toISOString().split("T")[0];
    const res = await fetch(`/api/game-slots?generate=true&from=${fromStr}`);
    const data = await res.json();
    setGameSlots(data);
  }, [settings?.startDate]);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings(data);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!selectedPlayerId) return;
    const res = await fetch(`/api/notifications?playerId=${selectedPlayerId}`);
    const data = await res.json();
    setNotifications(data);
  }, [selectedPlayerId]);

  useEffect(() => {
    const saved = localStorage.getItem("selectedPlayerId");
    if (saved) setSelectedPlayerId(Number(saved));
    Promise.all([fetchPlayers(), fetchGameSlots(), fetchSettings()]).then(() => setLoading(false));
  }, [fetchPlayers, fetchGameSlots, fetchSettings]);

  useEffect(() => {
    if (selectedPlayerId) {
      localStorage.setItem("selectedPlayerId", String(selectedPlayerId));
      fetchNotifications();
    }
  }, [selectedPlayerId, fetchNotifications]);

  useEffect(() => {
    sessionStorage.removeItem("setupRole");
    setShowPinPrompt(false);
    setPinInput("");
    setPinError("");
    window.dispatchEvent(new Event("storage"));

    if (selectedPlayerId && settings) {
      const isAdmin =
        selectedPlayerId === settings.creatorPlayerId ||
        selectedPlayerId === settings.maintainerPlayerId;
      if (isAdmin) {
        setShowPinPrompt(true);
      }
    }
  }, [selectedPlayerId, settings]);

  useEffect(() => {
    const interval = setInterval(fetchGameSlots, 30000);
    return () => clearInterval(interval);
  }, [fetchGameSlots]);

  const handleJoin = async (gameSlotId: number) => {
    if (!selectedPlayerId) return alert("Please select your name first");
    const res = await fetch("/api/signups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlotId, playerId: selectedPlayerId }),
    });
    if (!res.ok) {
      const err = await res.json();
      return alert(err.error);
    }
    setRecentlyJoined((prev) => new Set(prev).add(gameSlotId));
    setTimeout(() => {
      setRecentlyJoined((prev) => {
        const next = new Set(prev);
        next.delete(gameSlotId);
        return next;
      });
    }, 2000);
    fetchGameSlots();
  };

  const handleWithdraw = async (gameSlotId: number) => {
    if (!selectedPlayerId) return;
    if (!confirm("Are you sure you want to withdraw from this game?")) return;
    const res = await fetch(
      `/api/signups?gameSlotId=${gameSlotId}&playerId=${selectedPlayerId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const err = await res.json();
      return alert(err.error);
    }
    fetchGameSlots();
    fetchNotifications();
  };

  const markNotificationRead = async (id: number) => {
    await fetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    fetchNotifications();
  };

  const handlePinSubmit = async () => {
    setPinError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinInput, playerId: selectedPlayerId }),
    });
    if (!res.ok) {
      setPinError("Invalid PIN");
      return;
    }
    const data = await res.json();
    sessionStorage.setItem("setupRole", data.role);
    setShowPinPrompt(false);
    setPinInput("");
    window.dispatchEvent(new Event("storage"));
  };

  const startResetTimer = useCallback((delaySeconds: number) => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    let seconds = delaySeconds;
    setResetCountdown(seconds);
    countdownIntervalRef.current = setInterval(() => {
      seconds--;
      setResetCountdown(seconds);
      if (seconds <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      }
    }, 1000);
    resetTimerRef.current = setTimeout(() => {
      setSelectedPlayerId(null);
      localStorage.removeItem("selectedPlayerId");
      setResetCountdown(null);
    }, delaySeconds * 1000);
  }, []);

  const handleTimeChange = async (slotId: number, newTime: string) => {
    if (!newTime.trim()) return;
    await fetch("/api/game-slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, timeSlot: newTime.trim() }),
    });
    setEditingTimeKey(null);
    fetchGameSlots();
  };

  const handleCourtReservation = async (slotId: number, reservedCourt: string | null) => {
    await fetch("/api/game-slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, reservedCourt }),
    });
    fetchGameSlots();
  };

  const dates = [...new Set(gameSlots.map((s) => s.date))].sort();
  const courtNumbers = [...new Set(gameSlots.map((s) => s.courtNumber))].sort((a, b) => a - b);

  const slotMap = new Map<string, GameSlot>();
  for (const slot of gameSlots) {
    slotMap.set(`${slot.date}-${slot.courtNumber}`, slot);
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const formatDayDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    const day = date.toLocaleDateString("en-US", { weekday: "short" });
    const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { day, monthDay };
  };

  const isToday = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isPast = (dateStr: string) => {
    return new Date(dateStr + "T23:59:59") < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted text-lg">Loading...</div>
      </div>
    );
  }

  const maxPlayers = settings?.playersPerGame ?? 4;

  return (
    <div className="min-h-screen flex flex-col max-w-4xl">
      <header className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold">{settings?.clubName || "Games Signup"} <span className="text-base font-semibold text-primary">Games Signup</span> <span className="text-base font-normal text-muted">v{APP_VERSION}</span></h1>
          <div className="flex items-center gap-3">
            {selectedPlayerId && (
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-1.5 rounded-lg hover:bg-muted-bg"
                title="View your notifications"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-danger text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        <select
          value={selectedPlayerId || ""}
          onChange={(e) => {
            sessionStorage.removeItem("setupRole");
            setShowPinPrompt(false);
            setPinInput("");
            setPinError("");
            window.dispatchEvent(new Event("storage"));
            const newId = e.target.value ? Number(e.target.value) : null;
            setSelectedPlayerId(null);
            setTimeout(() => setSelectedPlayerId(newId), 0);
            if (e.target.value) startResetTimer(resetDelay);
            else {
              if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
              if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
              setResetCountdown(null);
            }
          }}
          className="w-48 p-2.5 rounded-lg border border-border bg-card text-base"
        >
          <option value="">— Select name —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 mt-2">
          <label className="text-xs text-muted whitespace-nowrap">Auto-reset:</label>
          <input
            type="range"
            min={10}
            max={120}
            step={5}
            value={resetDelay}
            onChange={(e) => setResetDelay(Number(e.target.value))}
            className="w-28"
            title="Seconds before dropdown resets to Select name"
          />
          <span className="text-xs text-muted w-10">{resetDelay}s</span>
          {resetCountdown !== null && resetCountdown > 0 && (
            <span className="text-xs text-primary font-medium">↺ {resetCountdown}s</span>
          )}
        </div>
      </header>

      {showPinPrompt && (
        <div className="mx-4 mt-2 border border-border rounded-lg bg-card p-4">
          <div className="text-sm font-medium mb-2">Enter your PIN to access admin features:</div>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
              placeholder="PIN"
              autoFocus
              autoComplete="off"
              className="w-24 p-2 rounded-lg border border-border text-base"
            />
            <button onClick={handlePinSubmit} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium" title="Submit your PIN to unlock admin features">OK</button>
            <button onClick={() => { setShowPinPrompt(false); setPinInput(""); }} className="px-4 py-2 bg-gray-200 text-foreground rounded-lg text-sm font-medium" title="Continue as a regular player without admin access">Skip</button>
          </div>
          {pinError && <div className="text-danger text-sm mt-1">{pinError}</div>}
        </div>
      )}

      {showNotifications && (
        <div className="mx-4 mt-2 border border-border rounded-lg bg-card overflow-hidden">
          <div className="p-3 border-b border-border font-medium bg-muted-bg text-sm">Notifications</div>
          {notifications.length === 0 ? (
            <div className="p-4 text-muted text-sm">No notifications</div>
          ) : (
            notifications.slice(0, 10).map((n) => (
              <div key={n.id} className={`p-3 border-b border-border text-sm cursor-pointer ${!n.read ? "bg-blue-50" : ""}`} onClick={() => !n.read && markNotificationRead(n.id)}>
                <div className="flex items-start gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.type === "CANCELLATION" ? "bg-danger" : n.type === "REMINDER" ? "bg-primary" : "bg-muted"}`} />
                  <div>
                    <p>{n.message}</p>
                    <p className="text-muted text-xs mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="px-4 pt-3">
        <Link
          href="/player-schedule"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          View this week&apos;s schedule &rarr;
        </Link>
      </div>

      <div className="flex-1 overflow-x-auto px-2 py-4">
        <table className="border-collapse w-full min-w-[600px]" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "70px" }} />
            {dates.map((d) => (
              <col key={d} style={{ width: "72px" }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <td className="border border-border p-1 text-sm font-bold text-foreground"></td>
              {dates.map((d) => {
                const { day, monthDay } = formatDayDate(d);
                return (
                  <td key={d} className={`border-l-2 border-r-2 border-t-2 border-border p-1 text-center ${isToday(d) ? "bg-primary text-white" : "bg-yellow-100"}`}>
                    <div className="text-sm font-extrabold text-foreground leading-tight" style={isToday(d) ? { color: "white" } : {}}>{day}</div>
                    <div className="text-xs font-bold text-foreground leading-tight" style={isToday(d) ? { color: "white" } : {}}>{monthDay}</div>
                  </td>
                );
              })}
            </tr>
          </thead>

          {courtNumbers.map((courtNum, courtIdx) => (
            <tbody key={`court-${courtNum}`}>
              <tr className="bg-muted-bg">
                <td className="border border-border p-1 text-sm font-extrabold text-center text-foreground" colSpan={dates.length + 1}>
                  Game {courtNum}
                  {gameSlots.some((s) => s.courtNumber === courtNum && s.isOverflow) && (
                    <span className="ml-2 text-xs font-normal text-orange-600">(overflow)</span>
                  )}
                </td>
              </tr>

              <tr>
                <td className="border border-border p-1 text-xs font-bold text-foreground text-center">Ct#</td>
                {dates.map((d) => {
                  const slot = slotMap.get(`${d}-${courtNum}`);
                  const isReserved = !!slot?.reservedCourt;
                  return (
                    <td key={d} className="border-l-2 border-r-2 border-t-2 border-border border-b border-border p-0 text-center bg-gray-50">
                      {slot && (
                        <div className="flex items-center justify-center gap-1 px-1 py-1.5">
                          <input type="checkbox" checked={isReserved} onChange={(e) => { if (e.target.checked) { handleCourtReservation(slot.id, slot.reservedCourt || ""); } else { handleCourtReservation(slot.id, null); } }} className="w-4 h-4" />
                          <input type="text" maxLength={2} value={slot.reservedCourt || ""} onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 2); handleCourtReservation(slot.id, val || null); }} placeholder="--" className="w-7 text-sm text-center border-0 outline-none bg-transparent font-bold" />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>

              <tr>
                <td className="border border-border p-1 text-xs font-bold text-foreground text-center">Time</td>
                {dates.map((d) => {
                  const slot = slotMap.get(`${d}-${courtNum}`);
                  const timeValue = slot?.timeSlot || settings?.defaultTimeSlot || "";
                  const key = `${d}-${courtNum}`;
                  const isEditing = editingTimeKey === key;
                  return (
                    <td key={d} className="border-l-2 border-r-2 border-border border-t border-b border-border p-0 text-xs text-center font-semibold text-foreground">
                      {isEditing && slot ? (
                        <input type="text" value={editingTimeValue} onChange={(e) => setEditingTimeValue(e.target.value)} onBlur={() => handleTimeChange(slot.id, editingTimeValue)} onKeyDown={(e) => { if (e.key === "Enter") handleTimeChange(slot.id, editingTimeValue); if (e.key === "Escape") setEditingTimeKey(null); }} autoFocus className="w-full text-xs text-center font-semibold p-1 border-0 outline-none bg-blue-50" />
                      ) : (
                        <div onClick={() => { setEditingTimeKey(key); setEditingTimeValue(timeValue); }} className="p-1 cursor-pointer hover:bg-blue-50 transition-colors" title="Click to change time">{timeValue}</div>
                      )}
                    </td>
                  );
                })}
              </tr>

              {Array.from({ length: maxPlayers }, (_, playerIdx) => (
                <tr key={`${courtNum}-${playerIdx}`}>
                  <td className="border border-border p-1 text-xs font-bold text-center text-foreground">{playerIdx + 1}</td>
                  {dates.map((d) => {
                    const slot = slotMap.get(`${d}-${courtNum}`);
                    const isLastRow = playerIdx === maxPlayers - 1;
                    if (!slot) {
                      return <td key={d} className={`border-l-2 border-r-2 border-border border-t border-b border-border ${isLastRow ? "border-b-2" : ""} p-0 bg-gray-50`} />;
                    }
                    const signup = slot.signups[playerIdx];
                    const isFull = slot.signups.length >= slot.maxPlayers;
                    const isPlayerSignedUp = slot.signups.some((s) => s.playerId === selectedPlayerId);
                    const isThisMe = signup?.playerId === selectedPlayerId;
                    const datePast = isPast(d);
                    const isEmptySlot = !signup;
                    const canJoin = isEmptySlot && !isFull && !datePast && selectedPlayerId && !isPlayerSignedUp;
                    return (
                      <td key={d} className={`border-l-2 border-r-2 border-border border-t border-b border-border ${isLastRow ? "border-b-2" : ""} p-0 text-center ${datePast ? "bg-gray-100 opacity-60" : isFull ? "bg-success-bg/40" : ""}`}>
                        {signup ? (
                          <div className={`px-0.5 py-1 text-sm font-bold leading-tight truncate ${isThisMe && recentlyJoined.has(slot.id) ? "bg-primary text-white" : isThisMe ? "text-primary cursor-pointer underline" : "text-foreground"}`} onClick={() => { if (isThisMe && !datePast) handleWithdraw(slot.id); }} title={isThisMe && !datePast ? "Click to withdraw" : signup.playerName}>
                            {signup.playerName}
                          </div>
                        ) : canJoin ? (
                          <button onClick={() => handleJoin(slot.id)} className="w-full h-full px-0.5 py-1 text-lg font-extrabold text-primary hover:bg-blue-50 transition-colors cursor-pointer" title="Click to join">+</button>
                        ) : (
                          <div className="px-0.5 py-1 text-sm text-transparent select-none">&nbsp;</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {courtIdx < courtNumbers.length - 1 && (
                <tr><td colSpan={dates.length + 1} className="h-3 bg-background" /></tr>
              )}
            </tbody>
          ))}
        </table>
      </div>

      <footer className="border-t border-border px-4 py-2 text-xs text-muted flex flex-wrap gap-4">
        <span><span className="inline-block w-3 h-3 bg-primary rounded mr-1 align-middle" /> = You (click to withdraw)</span>
        <span><span className="inline-block w-3 h-3 bg-success rounded mr-1 align-middle" /> = Game full</span>
        <span className="text-primary font-medium">+</span> = Click to join
        <span className="ml-auto">Auto-refreshes every 30s</span>
      </footer>

      {gameSlots.length === 0 && (
        <div className="text-center py-12 text-muted">
          <p className="text-lg mb-2">No games available</p>
          <p className="text-sm">Go to <Link href="/setup" className="text-primary underline">Setup</Link> to configure courts and generate game slots.</p>
        </div>
      )}

      <div className="border-t border-border px-4 py-3 mt-4 text-xs text-muted">
        <p className="mb-2"><Link href="/guide" className="text-primary font-semibold hover:underline">Player Guide</Link> — How to join games, withdraw, notifications, and more</p>
        <p className="font-semibold text-foreground mb-1">Add to your phone&apos;s home screen:</p>
        <p><strong>iPhone:</strong> Open in Safari &rarr; tap Share &rarr; &quot;Add to Home Screen&quot;</p>
        <p><strong>Android:</strong> Open in Chrome &rarr; tap &#8942; menu &rarr; &quot;Add to Home Screen&quot;</p>
      </div>
    </div>
  );
}
