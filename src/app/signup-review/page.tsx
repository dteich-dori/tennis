"use client";

import { useCallback, useEffect, useState } from "react";

interface SignupRequest {
  id: number;
  firstName: string;
  lastName: string;
  cellNumber: string | null;
  carrier: string | null;
  email: string | null;
  notes: string | null;
  consentGiven: boolean;
  consentText: string;
  consentIp: string | null;
  consentUserAgent: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

interface Season {
  id: number;
  startDate: string;
  endDate: string;
}

type TabKey = "pending" | "approved" | "rejected" | "all";

const SKILL_OPTIONS = ["A", "B", "C", "D"];
const FREQ_OPTIONS = [
  { value: "0", label: "Sub (0)" },
  { value: "1", label: "1x contract" },
  { value: "1+", label: "1+ (1x + sub)" },
  { value: "2", label: "2x contract" },
  { value: "2+", label: "2+ (2x or more)" },
];

function formatDateTime(iso: string): string {
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

export default function SignupReviewPage() {
  const [rows, setRows] = useState<SignupRequest[]>([]);
  const [tab, setTab] = useState<TabKey>("pending");
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  // Per-row form state for pending approvals
  const [approveForm, setApproveForm] = useState<Record<number, {
    seasonId: number | null;
    skillLevel: string;
    contractedFrequency: string;
  }>>({});

  const load = useCallback(async (t: TabKey) => {
    setError("");
    try {
      const res = await fetch(`/api/signup-requests?status=${t}`);
      if (!res.ok) throw new Error("failed");
      setRows((await res.json()) as SignupRequest[]);
    } catch {
      setError("Failed to load signup requests.");
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  useEffect(() => {
    fetch("/api/seasons")
      .then((r) => r.json())
      .then((s: Season[]) => setSeasons(s))
      .catch(() => {
        /* ignore */
      });
  }, []);

  const latestSeasonId = seasons.length > 0 ? seasons[seasons.length - 1].id : null;

  const getForm = (id: number) =>
    approveForm[id] ?? {
      seasonId: latestSeasonId,
      skillLevel: "C",
      contractedFrequency: "0",
    };

  const updateForm = (
    id: number,
    patch: Partial<{ seasonId: number | null; skillLevel: string; contractedFrequency: string }>
  ) => setApproveForm((a) => ({ ...a, [id]: { ...getForm(id), ...patch } }));

  const handleReject = async (id: number) => {
    if (!confirm("Reject this signup request?")) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/signup-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusyId(null);
  };

  const handleApprove = async (id: number) => {
    const form = getForm(id);
    if (!form.seasonId) {
      setError("Please pick a season before approving.");
      return;
    }
    if (!confirm(`Approve this request and create a player in season ${form.seasonId}?`)) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/signup-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          seasonId: form.seasonId,
          skillLevel: form.skillLevel,
          contractedFrequency: form.contractedFrequency,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusyId(null);
  };

  const tabCount = (list: SignupRequest[]) => list.length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Sign-up Requests</h1>
        <div className="text-sm text-muted">
          Public form: <a href="/join" target="_blank" className="text-primary underline">/join</a>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Submissions from the public <code>/join</code> page. Each row
        shows the exact consent text the person agreed to (frozen at
        submission time) plus their IP address and browser — the audit
        evidence you can point Twilio at if a carrier review comes back.
      </p>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-border">
        {(["pending", "approved", "rejected", "all"] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t}
            {tab === t && ` (${tabCount(rows)})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted p-4 border border-border rounded">
          No {tab} requests.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const form = getForm(r.id);
            const isPending = r.status === "pending";
            return (
              <div
                key={r.id}
                className="border border-border rounded-lg p-4 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div>
                    <h2 className="font-semibold text-lg">
                      {r.firstName} {r.lastName}
                    </h2>
                    <p className="text-xs text-gray-500">
                      Submitted {formatDateTime(r.createdAt)}
                      {r.reviewedAt && ` · Reviewed ${formatDateTime(r.reviewedAt)}`}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded ${
                      r.status === "pending"
                        ? "bg-amber-100 text-amber-800"
                        : r.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {r.status.toUpperCase()}
                  </span>
                </div>

                {/* Contact info */}
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-3">
                  <div>
                    <dt className="text-xs text-gray-500">Cell</dt>
                    <dd>{r.cellNumber || <em className="text-gray-400">not provided</em>}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Carrier</dt>
                    <dd>{r.carrier || <em className="text-gray-400">—</em>}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Email</dt>
                    <dd>{r.email || <em className="text-gray-400">not provided</em>}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Notes</dt>
                    <dd>{r.notes || <em className="text-gray-400">—</em>}</dd>
                  </div>
                </dl>

                {/* Audit block — this is what the reviewer wants to see */}
                <details className="text-xs text-gray-700 border border-amber-200 bg-amber-50 rounded p-2 mb-3">
                  <summary className="cursor-pointer font-semibold text-amber-900">
                    Consent audit (click to expand)
                  </summary>
                  <div className="mt-2 space-y-2">
                    <p>
                      <span className="font-semibold">Consent given:</span>{" "}
                      {r.consentGiven ? "yes" : "NO"}
                    </p>
                    <p className="whitespace-pre-wrap">
                      <span className="font-semibold">Exact text agreed to:</span>{" "}
                      {r.consentText}
                    </p>
                    <p>
                      <span className="font-semibold">IP:</span>{" "}
                      {r.consentIp ?? "—"}
                    </p>
                    <p>
                      <span className="font-semibold">User-Agent:</span>{" "}
                      <code>{r.consentUserAgent ?? "—"}</code>
                    </p>
                  </div>
                </details>

                {/* Approve controls (only for pending) */}
                {isPending && (
                  <div className="border-t border-border pt-3 flex flex-wrap items-end gap-3">
                    <label className="text-xs">
                      <span className="block text-gray-500 mb-1">Season</span>
                      <select
                        value={form.seasonId ?? ""}
                        onChange={(e) =>
                          updateForm(r.id, { seasonId: Number(e.target.value) || null })
                        }
                        className="border border-border rounded px-2 py-1 text-sm bg-white"
                      >
                        {seasons.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.startDate} → {s.endDate}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      <span className="block text-gray-500 mb-1">Skill</span>
                      <select
                        value={form.skillLevel}
                        onChange={(e) => updateForm(r.id, { skillLevel: e.target.value })}
                        className="border border-border rounded px-2 py-1 text-sm bg-white"
                      >
                        {SKILL_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      <span className="block text-gray-500 mb-1">Contract</span>
                      <select
                        value={form.contractedFrequency}
                        onChange={(e) =>
                          updateForm(r.id, { contractedFrequency: e.target.value })
                        }
                        className="border border-border rounded px-2 py-1 text-sm bg-white"
                      >
                        {FREQ_OPTIONS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2 ml-auto">
                      <button
                        onClick={() => handleApprove(r.id)}
                        disabled={busyId === r.id}
                        className="bg-green-600 text-white text-sm px-3 py-1.5 rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {busyId === r.id ? "…" : "Approve & create player"}
                      </button>
                      <button
                        onClick={() => handleReject(r.id)}
                        disabled={busyId === r.id}
                        className="bg-white border border-red-300 text-red-700 text-sm px-3 py-1.5 rounded hover:bg-red-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
