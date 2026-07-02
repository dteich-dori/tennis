"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

interface TemplateSlot {
  key: string;
  label: string;
  helpText: string;
  contentType: "markdown" | "plain";
  content: string;
  isOverride: boolean;
  updatedAt: string | null;
  defaultContent: string;
}

function formatTs(iso: string | null): string {
  if (!iso) return "";
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

export default function PageTemplatesPage() {
  const [slots, setSlots] = useState<TemplateSlot[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/page-templates");
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as TemplateSlot[];
      setSlots(data);
      // Seed drafts with the current stored content
      setDrafts((old) => {
        const next = { ...old };
        for (const s of data) if (!(s.key in next)) next[s.key] = s.content;
        return next;
      });
    } catch {
      setError("Failed to load page templates.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (key: string) => {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/page-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, content: drafts[key] ?? "" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      setMessage(`Saved ${key}. Live pages will reflect it immediately.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(null);
  };

  const resetToDefault = async (key: string) => {
    if (!confirm("Reset this template to its default content? Your custom edits will be lost.")) return;
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/page-templates?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      // Drop the draft so load() reseeds from the reset content
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      setMessage(`Reset ${key} to default.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(null);
  };

  const isDirty = (slot: TemplateSlot) => (drafts[slot.key] ?? slot.content) !== slot.content;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Page Templates</h1>
        <div className="text-sm text-muted flex gap-4">
          <a href="/join" target="_blank" className="text-primary underline">Open /join</a>
          <a href="/sms-terms" target="_blank" className="text-primary underline">Open /sms-terms</a>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Edit the copy for the public pages. Markdown slots support headings,
        lists, bold, italic, and links. Changes take effect immediately on
        the live pages — no rebuild required. &ldquo;Reset to default&rdquo;
        deletes your override and falls back to the code-shipped default.
      </p>
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mb-6">
        <strong>Consent text note:</strong> The &ldquo;SMS consent statement&rdquo;
        is stored verbatim with every signup request as A2P 10DLC audit
        evidence. Edit carefully — the change applies to future submissions
        only; past submissions keep the text they originally agreed to.
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

      <div className="space-y-6">
        {slots.map((slot) => {
          const draft = drafts[slot.key] ?? slot.content;
          const dirty = isDirty(slot);
          return (
            <section key={slot.key} className="border border-border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div>
                  <h2 className="font-semibold text-lg">{slot.label}</h2>
                  <p className="text-xs text-gray-500">
                    key: <code>{slot.key}</code> · format:{" "}
                    <code>{slot.contentType}</code>
                    {slot.isOverride ? (
                      <>
                        {" "}
                        · overridden{slot.updatedAt ? ` on ${formatTs(slot.updatedAt)}` : ""}
                      </>
                    ) : (
                      <> · using default (no override)</>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setPreviewOpen((p) => ({ ...p, [slot.key]: !p[slot.key] }))
                    }
                    className="text-xs px-3 py-1 rounded border border-border hover:bg-gray-50"
                  >
                    {previewOpen[slot.key] ? "Hide preview" : "Show preview"}
                  </button>
                  {slot.isOverride && (
                    <button
                      onClick={() => resetToDefault(slot.key)}
                      disabled={busy === slot.key}
                      className="text-xs px-3 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reset to default
                    </button>
                  )}
                  <button
                    onClick={() => save(slot.key)}
                    disabled={busy === slot.key || !dirty}
                    className="text-xs px-3 py-1 rounded bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
                  >
                    {busy === slot.key ? "…" : dirty ? "Save changes" : "Saved"}
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-600 mb-3">{slot.helpText}</p>

              <textarea
                value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [slot.key]: e.target.value }))}
                rows={slot.contentType === "plain" ? 6 : 16}
                className="w-full border border-border rounded px-3 py-2 text-sm font-mono"
              />

              {previewOpen[slot.key] && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs text-gray-500 mb-2">Preview:</p>
                  {slot.contentType === "markdown" ? (
                    <div className="prose prose-sm max-w-none bg-gray-50 rounded p-4 text-sm text-gray-800">
                      <ReactMarkdown>{draft}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap bg-gray-50 rounded p-4 text-sm text-gray-800">
                      {draft}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
