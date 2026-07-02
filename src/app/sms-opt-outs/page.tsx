"use client";

import { useCallback, useEffect, useState } from "react";

interface OptedOutPlayer {
  id: number;
  firstName: string;
  lastName: string;
  cellNumber: string | null;
  carrier: string | null;
  email: string | null;
  isActive: boolean;
  smsOptOut: boolean;
  smsOptOutAt: string | null;
  smsOptOutReason: string | null;
}

interface Season {
  id: number;
  startDate: string;
  endDate: string;
}

interface CandidatePlayer {
  id: number;
  firstName: string;
  lastName: string;
  cellNumber: string | null;
  smsOptOut: boolean;
}

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SmsOptOutsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [optedOut, setOptedOut] = useState<OptedOutPlayer[]>([]);
  const [candidates, setCandidates] = useState<CandidatePlayer[]>([]);
  const [selectedManualId, setSelectedManualId] = useState<string>("");
  const [manualReason, setManualReason] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (sid: number) => {
    setError("");
    try {
      const [outsRes, playersRes] = await Promise.all([
        fetch(`/api/sms-opt-outs?seasonId=${sid}`),
        fetch(`/api/players?seasonId=${sid}`),
      ]);
      if (!outsRes.ok || !playersRes.ok) throw new Error("load failed");
      const outs = (await outsRes.json()) as OptedOutPlayer[];
      const all = (await playersRes.json()) as CandidatePlayer[];
      setOptedOut(outs);
      // Candidates for manual opt-out: those with a cell number AND
      // not already opted out.
      setCandidates(
        all
          .filter((p) => p.cellNumber && !p.smsOptOut)
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
      );
    } catch {
      setError("Failed to load opt-out data.");
    }
  }, []);

  useEffect(() => {
    fetch("/api/seasons")
      .then((r) => r.json())
      .then((s: Season[]) => {
        setSeasons(s);
        if (s.length > 0) setSeasonId(s[s.length - 1].id);
      })
      .catch(() => setError("Failed to load seasons."));
  }, []);

  useEffect(() => {
    if (seasonId) load(seasonId);
  }, [seasonId, load]);

  const reEnable = async (p: OptedOutPlayer) => {
    if (!confirm(
      `Re-enable SMS for ${p.firstName} ${p.lastName}? They will start receiving text messages again on the next send. Only do this if they explicitly asked to be re-added.`
    )) return;
    setBusyId(p.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/sms-opt-outs/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optOut: false }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      setMessage(`Re-enabled SMS for ${p.firstName} ${p.lastName}.`);
      if (seasonId) await load(seasonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusyId(null);
  };

  const manualOptOut = async () => {
    const pid = Number(selectedManualId);
    if (!pid) {
      setError("Please pick a player.");
      return;
    }
    const c = candidates.find((x) => x.id === pid);
    if (!c) return;
    if (!confirm(
      `Manually opt out ${c.firstName} ${c.lastName} from SMS? They will no longer receive any text messages until they reply START or you re-enable them here.`
    )) return;
    setManualBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/sms-opt-outs/${pid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optOut: true,
          reason: manualReason.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      setMessage(`${c.firstName} ${c.lastName} manually opted out.`);
      setSelectedManualId("");
      setManualReason("");
      if (seasonId) await load(seasonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setManualBusy(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">SMS Opt-Out List</h1>
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted flex items-center gap-2">
            Season
            <select
              value={seasonId ?? ""}
              onChange={(e) => setSeasonId(Number(e.target.value) || null)}
              className="border border-border rounded px-2 py-1 text-sm bg-white"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.startDate} → {s.endDate}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Players who replied <strong>STOP</strong> (or a related opt-out
        keyword) to a text message. The Twilio webhook flips the flag
        automatically; the send code skips these players for SMS
        thereafter. Members can reply <strong>START</strong> to opt back
        in on their own. Use the buttons here only when a member asks
        in person.
      </p>

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="border border-green-300 bg-green-50 text-green-800 rounded px-4 py-3 mb-4 text-sm">
          {message}
        </div>
      )}

      {/* Current opt-outs */}
      <section className="border border-border rounded-lg bg-white mb-6">
        <h2 className="font-semibold text-sm p-3 border-b border-border bg-gray-50">
          Currently opted out ({optedOut.length})
        </h2>
        {optedOut.length === 0 ? (
          <p className="text-sm text-muted p-4">
            No players are currently opted out of SMS.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-border">
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Cell</th>
                <th className="px-3 py-2">Opted-out at</th>
                <th className="px-3 py-2">Reason (message body or admin note)</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {optedOut.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-none">
                  <td className="px-3 py-2">
                    <strong>{p.lastName}, {p.firstName}</strong>
                    {!p.isActive && (
                      <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 rounded">
                        inactive
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {p.cellNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{formatTs(p.smsOptOutAt)}</td>
                  <td className="px-3 py-2 text-xs">
                    <code className="text-gray-700">{p.smsOptOutReason ?? "—"}</code>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => reEnable(p)}
                      disabled={busyId === p.id}
                      className="text-xs px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {busyId === p.id ? "…" : "Re-enable SMS"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Manual opt-out */}
      <section className="border border-border rounded-lg bg-white">
        <h2 className="font-semibold text-sm p-3 border-b border-border bg-gray-50">
          Manually opt out a player
        </h2>
        <div className="p-4">
          <p className="text-xs text-gray-600 mb-3">
            Use this only when a member asks in person, by email, or by
            phone to stop receiving texts. The audit reason is stored on
            the player record so you can distinguish it from a
            Twilio-webhook-driven opt-out.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs flex-1 min-w-64">
              <span className="block text-gray-500 mb-1">Player (has cell + not already opted out)</span>
              <select
                value={selectedManualId}
                onChange={(e) => setSelectedManualId(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 text-sm bg-white"
              >
                <option value="">— select player —</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName} · {p.cellNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs flex-1 min-w-64">
              <span className="block text-gray-500 mb-1">Reason (optional — for audit)</span>
              <input
                type="text"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="e.g. asked to stop by email on July 2"
                className="w-full border border-border rounded px-2 py-1.5 text-sm"
              />
            </label>
            <button
              onClick={manualOptOut}
              disabled={manualBusy || !selectedManualId}
              className="bg-red-600 text-white text-sm px-4 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
            >
              {manualBusy ? "…" : "Opt out"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
