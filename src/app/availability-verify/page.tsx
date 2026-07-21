"use client";

import { useCallback, useEffect, useState } from "react";

interface Season {
  id: number;
  startDate: string;
  endDate: string;
}

interface Player {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  contractedFrequency: string;
  isActive: boolean;
}

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
}

type RecipientGroup = "All" | "Contract" | "Subs" | "Selected";

interface Preview {
  to: string;
  name: string;
  subject: string;
  text: string;
  html: string;
}

const DEFAULT_SUBJECT = "Please verify your availability for the tennis season";
const DEFAULT_INTRO = `The season is about to begin and I want to make sure the availability I have on file for you is correct. Please review your blocked days of the week and your vacations below.

If anything is wrong or has changed, just reply to this email and I'll update your record.`;

export default function AvailabilityVerifyPage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState<string>(DEFAULT_SUBJECT);
  const [introText, setIntroText] = useState<string>(DEFAULT_INTRO);
  const [recipientGroup, setRecipientGroup] = useState<RecipientGroup>("Contract");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);

  const load = useCallback(async () => {
    const s = (await fetch("/api/seasons").then((r) => r.json())) as Season[];
    if (s.length === 0) return;
    const latest = s[s.length - 1];
    setSeason(latest);
    const pl = (await fetch(`/api/players?seasonId=${latest.id}`).then((r) => r.json())) as Player[];
    setPlayers(pl.filter((p) => p.isActive).sort((a, b) => a.lastName.localeCompare(b.lastName)));
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/communications/templates");
      if (!res.ok) return;
      const list = (await res.json()) as EmailTemplate[];
      setTemplates(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    loadTemplates();
  }, [load, loadTemplates]);

  const filtered = players.filter((p) => {
    if (recipientGroup === "Contract") return p.contractedFrequency !== "0";
    if (recipientGroup === "Subs") return p.contractedFrequency === "0";
    if (recipientGroup === "Selected") return selectedIds.has(p.id);
    return true;
  });
  const emailable = filtered.filter((p) => p.email && p.email.trim().length > 0);
  const missingEmail = filtered.filter((p) => !p.email || p.email.trim().length === 0);

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => String(t.id) === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setIntroText(tpl.body);
  };

  const saveAsTemplate = async () => {
    const name = prompt("Save as template — name it (e.g., \"Season-start availability check\"):");
    if (!name?.trim()) return;
    setTemplateBusy(true);
    setError("");
    try {
      const res = await fetch("/api/communications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), subject, body: introText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      await loadTemplates();
      setSelectedTemplateId(String(body.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setTemplateBusy(false);
  };

  const updateSelectedTemplate = async () => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => String(t.id) === selectedTemplateId);
    if (!tpl) return;
    if (!confirm(`Overwrite the "${tpl.name}" template with the current subject + body?`)) return;
    setTemplateBusy(true);
    setError("");
    try {
      const res = await fetch("/api/communications/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tpl.id, name: tpl.name, subject, body: introText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setTemplateBusy(false);
  };

  const runPreview = async () => {
    if (!season) return;
    setPreviewLoading(true);
    setError("");
    setPreview(null);
    try {
      const res = await fetch("/api/communications/send-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: season.id,
          subject,
          introText,
          recipientGroup,
          selectedPlayerIds: recipientGroup === "Selected" ? [...selectedIds] : undefined,
          dryRun: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      setPreview(body.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setPreviewLoading(false);
  };

  const send = async () => {
    if (!season) return;
    if (!confirm(
      `Send personalized availability emails to ${emailable.length} recipient${emailable.length === 1 ? "" : "s"}?`
    )) return;
    setSending(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/communications/send-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: season.id,
          subject,
          introText,
          recipientGroup,
          selectedPlayerIds: recipientGroup === "Selected" ? [...selectedIds] : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      setResult({ sent: body.sent, failed: body.failed });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSending(false);
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-2">Verify Availability by Email</h1>
      <p className="text-sm text-gray-600 mb-6">
        Send each recipient a personalized email that lists their current
        blocked days of the week and vacations on file, so they can reply
        with any corrections. Email only — no SMS.
      </p>

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}
      {result && (
        <div className="border border-green-300 bg-green-50 text-green-800 rounded px-4 py-3 mb-4 text-sm">
          Sent {result.sent} email{result.sent === 1 ? "" : "s"}{result.failed > 0 ? ` · ${result.failed} failed` : ""}.
        </div>
      )}

      {/* Template picker + save */}
      <section className="border border-border rounded-lg p-4 mb-4 bg-white">
        <label className="block text-sm font-semibold mb-2">Templates</label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedTemplateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="border border-border rounded px-2 py-1 text-sm bg-white min-w-64"
          >
            <option value="">— select a template to load —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={saveAsTemplate}
            disabled={templateBusy || !introText.trim() || !subject.trim()}
            className="text-xs border border-border px-3 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Save as new template
          </button>
          {selectedTemplateId && (
            <button
              onClick={updateSelectedTemplate}
              disabled={templateBusy}
              className="text-xs border border-border px-3 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Overwrite selected template
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Templates are shared with the main Communications page — a
          template you save here is picked up there and vice versa.
        </p>
      </section>

      {/* Subject */}
      <section className="border border-border rounded-lg p-4 mb-4 bg-white">
        <label className="block text-sm font-semibold mb-2">Subject line</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full border border-border rounded px-3 py-2 text-sm"
        />
      </section>

      {/* Intro text */}
      <section className="border border-border rounded-lg p-4 mb-4 bg-white">
        <label className="block text-sm font-semibold mb-2">
          Message body (shown above the availability block in each email)
        </label>
        <textarea
          value={introText}
          onChange={(e) => setIntroText(e.target.value)}
          rows={6}
          className="w-full border border-border rounded px-3 py-2 text-sm"
        />
        <button
          onClick={() => { setSubject(DEFAULT_SUBJECT); setIntroText(DEFAULT_INTRO); setSelectedTemplateId(""); }}
          className="text-xs text-primary hover:underline mt-2"
        >
          Reset to default
        </button>
      </section>

      {/* Recipient selection */}
      <section className="border border-border rounded-lg p-4 mb-4 bg-white">
        <label className="block text-sm font-semibold mb-2">Recipients</label>
        <div className="flex gap-4 mb-3 text-sm">
          {(["All", "Contract", "Subs", "Selected"] as RecipientGroup[]).map((g) => (
            <label key={g} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="grp"
                checked={recipientGroup === g}
                onChange={() => setRecipientGroup(g)}
              />
              {g === "Contract" ? "Contract players" : g === "Subs" ? "Subs (freq 0)" : g === "All" ? "All active" : "Selected"}
            </label>
          ))}
        </div>
        {recipientGroup === "Selected" && (
          <div className="border-t border-border pt-3 mt-3 max-h-64 overflow-y-auto">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {players.map((p) => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleSelected(p.id)}
                  />
                  <span>
                    {p.lastName}, {p.firstName}
                    {!p.email && <span className="text-xs text-red-600 ml-1">(no email)</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">
          {emailable.length} recipient{emailable.length === 1 ? "" : "s"} will receive the email
          {missingEmail.length > 0 && (
            <>
              {" "}· <span className="text-amber-700">{missingEmail.length} skipped (no email address on file)</span>
            </>
          )}
        </p>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={runPreview}
          disabled={previewLoading || emailable.length === 0}
          className="border border-border px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {previewLoading ? "Building…" : "Preview one email"}
        </button>
        <button
          onClick={send}
          disabled={sending || emailable.length === 0}
          className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover disabled:opacity-50"
        >
          {sending ? "Sending…" : `Send to ${emailable.length}`}
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <section className="border border-border rounded-lg bg-white mb-4">
          <div className="p-4 border-b border-border bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">Preview based on {preview.name}&rsquo;s data</p>
            <p className="text-sm">
              <strong>To:</strong> {preview.to}
            </p>
            <p className="text-sm">
              <strong>Subject:</strong> {preview.subject}
            </p>
          </div>
          <div className="p-4 bg-white" dangerouslySetInnerHTML={{ __html: preview.html }} />
          <details className="border-t border-border p-3">
            <summary className="cursor-pointer text-xs text-gray-500">
              Show plain-text version
            </summary>
            <pre className="text-xs whitespace-pre-wrap mt-2 font-mono bg-gray-50 p-3 rounded">
              {preview.text}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}
