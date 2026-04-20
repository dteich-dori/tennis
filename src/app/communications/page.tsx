"use client";

import { useState, useEffect, useCallback } from "react";

interface Season {
  id: number;
  startDate: string;
  endDate: string;
}

interface Recipient {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  cellNumber: string | null;
  carrier: string | null;
  hasEmail: boolean;
  hasSms: boolean;
}

const CARRIERS = [
  { value: "", label: "— Carrier —" },
  { value: "verizon", label: "Verizon" },
  { value: "att", label: "AT&T" },
  { value: "tmobile", label: "T-Mobile" },
  { value: "sprint", label: "Sprint" },
  { value: "uscellular", label: "US Cellular" },
  { value: "boost", label: "Boost Mobile" },
  { value: "cricket", label: "Cricket" },
  { value: "metro", label: "Metro by T-Mobile" },
];

type Channel = "email" | "sms" | "both";

interface Template {
  id: number;
  seasonId: number;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface HistoryEntry {
  id: number;
  seasonId: number;
  subject: string;
  body: string;
  recipientGroup: string;
  recipientCount: number;
  recipientList: string;
  fromName: string;
  replyTo: string;
  sentAt: string;
}

type RecipientGroup = "ALL" | "Contract Players" | "Subs" | "Players" | "Test";
type TabView = "compose" | "templates" | "history";

export default function CommunicationsPage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>("compose");

  // Settings
  const [fromName, setFromName] = useState("Tennis Club");
  const [replyTo, setReplyTo] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testCarrier, setTestCarrier] = useState("");
  const [questionnaireUrl, setQuestionnaireUrl] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");

  // Channel selection
  const [channel, setChannel] = useState<Channel>("both");
  const [attachPersonalSchedule, setAttachPersonalSchedule] = useState(false);

  // File attachments (email only — transient; cleared after each send)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  // Compose
  const [recipientGroup, setRecipientGroup] = useState<RecipientGroup>("ALL");
  const [subject, setSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [showRecipients, setShowRecipients] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [sendError, setSendError] = useState("");
  const [sendWarnings, setSendWarnings] = useState<string[]>([]);

  // Clear post-send banners whenever the user starts composing a new message
  const clearSendBanners = () => {
    if (sendMessage) setSendMessage("");
    if (sendError) setSendError("");
    if (sendWarnings.length > 0) setSendWarnings([]);
  };

  // Test-as-player (only used in Test + attach-ics mode)
  const [testAsPlayerId, setTestAsPlayerId] = useState<number | null>(null);
  const [testFirstEventOnly, setTestFirstEventOnly] = useState(true);
  const [activePlayers, setActivePlayers] = useState<{ id: number; firstName: string; lastName: string; email: string | null }[]>([]);

  // Multi-player recipient selection (used when recipientGroup === "Players")
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: "", subject: "", body: "" });
  const [templateMessage, setTemplateMessage] = useState("");

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);

  // Load season
  const loadSeason = useCallback(async () => {
    const res = await fetch("/api/seasons");
    const data = (await res.json()) as Season[];
    if (data.length > 0) setSeason(data[data.length - 1]);
  }, []);

  // Load settings
  const loadSettings = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/communications/settings?seasonId=${seasonId}`);
    const data = (await res.json()) as {
      fromName: string;
      replyTo: string;
      testEmail: string;
      testPhone?: string;
      testCarrier?: string;
      questionnaireUrl: string;
    };
    setFromName(data.fromName || "Tennis Club");
    setReplyTo(data.replyTo || "");
    setTestEmail(data.testEmail || "");
    setTestPhone(data.testPhone || "");
    setTestCarrier(data.testCarrier || "");
    setQuestionnaireUrl(data.questionnaireUrl || "");
  }, []);

  // Load recipients for selected group
  const loadRecipients = useCallback(async (seasonId: number, group: RecipientGroup) => {
    if (group === "Players") {
      // Single-player mode — count is driven by selectedPlayerId, not the API
      setRecipients([]);
      return;
    }
    const res = await fetch(`/api/communications/recipients?seasonId=${seasonId}&group=${group}`);
    const data = (await res.json()) as { recipients: Recipient[]; count: number; message?: string };
    setRecipients(data.recipients);
    setRecipientCount(data.count);
  }, []);

  // Load templates
  const loadTemplates = useCallback(async (_seasonId?: number) => {
    const res = await fetch(`/api/communications/templates`);
    const data = (await res.json()) as Template[];
    setTemplates(data);
  }, []);

  // Load history
  const loadHistory = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/communications/history?seasonId=${seasonId}`);
    const data = (await res.json()) as HistoryEntry[];
    setHistory(data);
  }, []);

  // Load all active players in the season (for "Test as player" dropdown)
  const loadActivePlayers = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/players?seasonId=${seasonId}`);
    const data = (await res.json()) as { id: number; firstName: string; lastName: string; email: string | null; isActive: boolean }[];
    const active = data
      .filter((p) => p.isActive)
      .sort((a, b) => {
        const cmp = a.lastName.localeCompare(b.lastName);
        return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
      });
    setActivePlayers(active);
  }, []);

  useEffect(() => {
    loadSeason();
  }, [loadSeason]);

  useEffect(() => {
    if (season) {
      loadSettings(season.id);
      loadRecipients(season.id, recipientGroup);
      loadTemplates(season.id);
      loadHistory(season.id);
      loadActivePlayers(season.id);
    }
  }, [season, loadSettings, loadRecipients, loadTemplates, loadHistory, loadActivePlayers, recipientGroup]);

  // Auto-pick a default test player: first match by email, else first player alphabetically
  useEffect(() => {
    if (testAsPlayerId !== null) return; // user already picked one
    if (activePlayers.length === 0) return;
    const byEmail = testEmail
      ? activePlayers.find((p) => (p.email ?? "").toLowerCase() === testEmail.toLowerCase())
      : undefined;
    setTestAsPlayerId((byEmail ?? activePlayers[0]).id);
  }, [activePlayers, testEmail, testAsPlayerId]);

  // Keep recipientCount in sync when in Player (multi-select) mode
  useEffect(() => {
    if (recipientGroup === "Players") {
      setRecipientCount(selectedPlayerIds.length);
    }
  }, [recipientGroup, selectedPlayerIds]);

  // Save settings
  const handleSaveSettings = async () => {
    if (!season) return;
    setSettingsMessage("");
    const res = await fetch("/api/communications/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seasonId: season.id, fromName, replyTo, testEmail, testPhone, testCarrier, questionnaireUrl }),
    });
    if (res.ok) {
      setSettingsMessage("Settings saved.");
      setTimeout(() => setSettingsMessage(""), 3000);
    } else {
      setSettingsMessage("Failed to save settings.");
    }
  };

  // Send email
  // Read a File as base64 (without the `data:...;base64,` prefix)
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const attachedTotalBytes = attachedFiles.reduce((s, f) => s + f.size, 0);
  const ATTACH_WARN_BYTES = 4 * 1024 * 1024; // 4 MB — warn
  const ATTACH_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — block

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleSend = async () => {
    if (!season || !subject.trim() || !messageBody.trim()) return;

    if (attachedFiles.length > 0 && attachedTotalBytes > ATTACH_MAX_BYTES) {
      setSendError(
        `Attachments total ${formatBytes(attachedTotalBytes)} — max ${formatBytes(ATTACH_MAX_BYTES)}.`
      );
      return;
    }

    const channelLabel = channel === "email" ? "Email only" : channel === "sms" ? "Text only" : "Email + Text";
    let confirmMsg: string;
    if (recipientGroup === "Test") {
      confirmMsg = `Send test (${channelLabel})?`;
    } else if (recipientGroup === "Players") {
      if (selectedPlayerIds.length === 0) {
        setSendError("Please select at least one player.");
        return;
      }
      if (selectedPlayerIds.length === 1) {
        const p = activePlayers.find((x) => x.id === selectedPlayerIds[0]);
        const name = p ? `${p.firstName} ${p.lastName}` : "selected player";
        confirmMsg = `Send "${channelLabel}" to ${name}?\n\nSubject: ${subject}`;
      } else {
        confirmMsg = `Send "${channelLabel}" to ${selectedPlayerIds.length} selected player${selectedPlayerIds.length !== 1 ? "s" : ""}?\n\nSubject: ${subject}`;
      }
    } else {
      confirmMsg = `Send "${channelLabel}" to ${recipientCount} recipient${recipientCount !== 1 ? "s" : ""} (${recipientGroup})?\n\nSubject: ${subject}`;
    }

    if (!window.confirm(confirmMsg)) return;

    setSending(true);
    setSendMessage("");
    setSendError("");
    setSendWarnings([]);

    try {
      // Encode file attachments to base64 (email-only; SMS ignores them)
      let attachmentsPayload: Array<{
        filename: string;
        contentType: string;
        contentBase64: string;
      }> | undefined;
      if (attachedFiles.length > 0 && channel !== "sms") {
        attachmentsPayload = await Promise.all(
          attachedFiles.map(async (f) => ({
            filename: f.name,
            contentType: f.type || "application/octet-stream",
            contentBase64: await fileToBase64(f),
          }))
        );
      }

      const res = await fetch("/api/communications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: season.id,
          recipientGroup,
          subject,
          body: messageBody,
          fromName,
          replyTo,
          channel,
          attachPersonalSchedule: channel === "sms" ? false : attachPersonalSchedule,
          selectedPlayerIds: recipientGroup === "Players" ? selectedPlayerIds : undefined,
          testAsPlayerId: recipientGroup === "Test" && attachPersonalSchedule ? testAsPlayerId : undefined,
          icsFirstEventOnly: recipientGroup === "Test" && attachPersonalSchedule && testFirstEventOnly,
          attachments: attachmentsPayload,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        recipientCount?: number;
        emailsSent?: number;
        smsSent?: number;
        error?: string;
        warnings?: string[];
      };

      if (data.success) {
        const emailsSent = data.emailsSent ?? 0;
        const smsSent = data.smsSent ?? 0;
        const parts: string[] = [];
        if (emailsSent > 0) parts.push(`${emailsSent} email${emailsSent !== 1 ? "s" : ""}`);
        if (smsSent > 0) parts.push(`${smsSent} text${smsSent !== 1 ? "s" : ""}`);
        const summary = parts.length > 0 ? parts.join(", ") : `${data.recipientCount ?? 0} recipients`;

        if ((data.recipientCount ?? 0) === 0) {
          // Total failure
          setSendError("No messages were sent — see issues below.");
        } else {
          setSendMessage(`✓ Sent: ${summary}.`);
          // Clear attachments only on successful send
          setAttachedFiles([]);
        }
        if (data.warnings && data.warnings.length > 0) {
          setSendWarnings(data.warnings);
        }
        // Refresh history
        loadHistory(season.id);
      } else {
        setSendError(data.error || "Failed to send message.");
      }
    } catch (err) {
      setSendError(`Network error: ${err instanceof Error ? err.message : "Please try again."}`);
    } finally {
      setSending(false);
    }
  };

  // Template CRUD
  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim() || !templateForm.subject.trim()) {
      setTemplateMessage("Name and subject are required.");
      return;
    }
    setTemplateMessage("");

    if (editingTemplateId) {
      // Update
      const res = await fetch("/api/communications/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingTemplateId, ...templateForm }),
      });
      if (res.ok) {
        setTemplateMessage("Template updated.");
        setShowTemplateForm(false);
        setEditingTemplateId(null);
        setTemplateForm({ name: "", subject: "", body: "" });
        loadTemplates();
      }
    } else {
      // Create (global — no seasonId)
      const res = await fetch("/api/communications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateForm),
      });
      if (res.ok) {
        setTemplateMessage("Template created.");
        setShowTemplateForm(false);
        setTemplateForm({ name: "", subject: "", body: "" });
        loadTemplates();
      }
    }
    setTimeout(() => setTemplateMessage(""), 3000);
  };

  const handleDeleteTemplate = async (id: number, name: string) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    await fetch(`/api/communications/templates?id=${id}`, { method: "DELETE" });
    loadTemplates();
  };

  const handleLoadTemplate = (template: Template) => {
    clearSendBanners();
    setSubject(template.subject);
    setMessageBody(template.body);
    setActiveTab("compose");
  };

  const handleEditTemplate = (template: Template) => {
    setEditingTemplateId(template.id);
    setTemplateForm({ name: template.name, subject: template.subject, body: template.body });
    setShowTemplateForm(true);
  };

  // Format datetime for display
  const formatDateTime = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso + "Z"); // UTC
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (!season) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Communications</h1>
        <p className="text-muted text-sm">No season found. Create a season first.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">Communications</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {(["compose", "templates", "history"] as TabView[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab === "compose" ? "Compose" : tab === "templates" ? "Templates" : "History"}
          </button>
        ))}
      </div>

      {/* ===== COMPOSE TAB ===== */}
      {activeTab === "compose" && (
        <div className="space-y-6">
          {/* Settings section */}
          <div className="border border-border rounded-lg p-4 bg-gray-50">
            <h2 className="text-sm font-semibold mb-3">Email Settings</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">From Name</label>
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
                  placeholder="Tennis Club"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Reply-To Email</label>
                <input
                  type="email"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
                  placeholder="don@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Test Email</label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
                  placeholder="your@email.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3">
              <div>
                <label className="block text-xs font-medium mb-1">Test Phone</label>
                <input
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
                  placeholder="10 digits"
                  title="Phone number for SMS testing"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Test Carrier</label>
                <select
                  value={testCarrier}
                  onChange={(e) => setTestCarrier(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
                  title="Mobile carrier for SMS gateway"
                >
                  {CARRIERS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div />
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium mb-1">Questionnaire URL (Google Forms)</label>
              <input
                type="url"
                value={questionnaireUrl}
                onChange={(e) => setQuestionnaireUrl(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
                placeholder="https://docs.google.com/forms/d/e/..."
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleSaveSettings}
                className="px-3 py-1.5 bg-primary text-white rounded text-sm hover:opacity-90"
              >
                Save Settings
              </button>
              {settingsMessage && (
                <span className="text-sm text-green-600">{settingsMessage}</span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">
              Note: Emails are sent from your configured Gmail account. The From Name is displayed as the sender, and replies go to the Reply-To address. SMS uses carrier email gateways (e.g. <code>@vtext.com</code>) — players need a phone + carrier configured.
            </p>
          </div>

          {/* Recipient group */}
          <div>
            <label className="block text-sm font-medium mb-2">Recipient Group</label>
            <div className="flex gap-4">
              {(["ALL", "Contract Players", "Subs", "Players", "Test"] as RecipientGroup[]).map((group) => (
                <label key={group} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="recipientGroup"
                    value={group}
                    checked={recipientGroup === group}
                    onChange={() => { clearSendBanners(); setRecipientGroup(group); }}
                  />
                  {group}
                </label>
              ))}
            </div>

            {/* Multi-player selection (check one or more) */}
            {recipientGroup === "Players" && (
              <div className="mt-2 border border-border rounded bg-white">
                <div className="flex flex-wrap items-center gap-3 p-2 border-b border-border bg-muted-bg">
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    placeholder="Search players..."
                    className="border border-border rounded px-2 py-1 text-sm flex-1 min-w-[140px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      clearSendBanners();
                      const visible = activePlayers.filter((p) =>
                        `${p.lastName} ${p.firstName}`
                          .toLowerCase()
                          .includes(playerSearch.toLowerCase())
                      );
                      setSelectedPlayerIds(visible.map((p) => p.id));
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearSendBanners();
                      setSelectedPlayerIds([]);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Clear
                  </button>
                  <span className="text-xs text-muted">
                    {selectedPlayerIds.length} selected
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  {activePlayers
                    .filter((p) =>
                      `${p.lastName} ${p.firstName}`
                        .toLowerCase()
                        .includes(playerSearch.toLowerCase())
                    )
                    .map((p) => {
                      const checked = selectedPlayerIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-muted-bg cursor-pointer rounded"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              clearSendBanners();
                              setSelectedPlayerIds((prev) =>
                                e.target.checked
                                  ? [...prev, p.id]
                                  : prev.filter((id) => id !== p.id)
                              );
                            }}
                          />
                          <span className="flex-1">
                            {p.lastName}, {p.firstName}
                          </span>
                          <span className="text-xs text-muted">
                            {p.email ? p.email : "no email"}
                          </span>
                        </label>
                      );
                    })}
                  {activePlayers.filter((p) =>
                    `${p.lastName} ${p.firstName}`
                      .toLowerCase()
                      .includes(playerSearch.toLowerCase())
                  ).length === 0 && (
                    <div className="text-sm text-muted px-2 py-1">
                      No players match &ldquo;{playerSearch}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recipient count + preview */}
            <div className="mt-2 flex items-center gap-3">
              <span className="text-sm text-muted">
                {recipientGroup === "Test"
                  ? testEmail
                    ? `Test email: ${testEmail}`
                    : "No test email configured"
                  : recipientGroup === "Players"
                  ? (() => {
                      if (selectedPlayerIds.length === 0) return "No players selected";
                      if (selectedPlayerIds.length === 1) {
                        const p = activePlayers.find((x) => x.id === selectedPlayerIds[0]);
                        if (!p) return "No players selected";
                        return p.email ? `Sending to: ${p.email}` : "Selected player has no email";
                      }
                      return `${selectedPlayerIds.length} player${selectedPlayerIds.length !== 1 ? "s" : ""} selected`;
                    })()
                  : `${recipientCount} recipient${recipientCount !== 1 ? "s" : ""}`}
              </span>
              {recipientCount > 0 && recipientGroup !== "Test" && recipientGroup !== "Players" && (
                <button
                  onClick={() => setShowRecipients(!showRecipients)}
                  className="text-sm text-primary hover:underline"
                >
                  {showRecipients ? "Hide" : "Show"} recipients
                </button>
              )}
            </div>

            {/* Recipient list */}
            {showRecipients && recipients.length > 0 && (
              <div className="mt-2 border border-border rounded max-h-48 overflow-y-auto">
                {recipients.map((r, idx) => (
                  <div
                    key={r.id}
                    className={`px-3 py-1.5 text-sm flex justify-between items-center ${
                      idx % 2 === 0 ? "bg-white" : "bg-[#fdf8f0]"
                    }`}
                  >
                    <span>{r.lastName}, {r.firstName}</span>
                    <span className="text-muted text-xs">
                      {r.hasEmail && <span title={r.email || ""}>📧</span>}
                      {r.hasSms && <span className="ml-1" title={`${r.cellNumber} (${r.carrier})`}>📱</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Load template / Send Questionnaire */}
          <div className="flex items-end gap-4">
            {templates.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">Load Template</label>
                <select
                  className="border border-border rounded px-3 py-1.5 text-sm w-64"
                  value=""
                  onChange={(e) => {
                    const t = templates.find((t) => t.id === parseInt(e.target.value));
                    if (t) handleLoadTemplate(t);
                  }}
                >
                  <option value="">— Select a template —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => {
                if (!questionnaireUrl.trim()) {
                  alert("Please set a Questionnaire URL in Email Settings first.");
                  return;
                }
                clearSendBanners();
                setSubject("Brooklake Tennis \u2014 Player Questionnaire");
                setMessageBody(
                  `Please take a moment to fill out the following questionnaire:\n\n${questionnaireUrl}\n\nThank you!`
                );
              }}
              className="px-4 py-1.5 border border-primary text-primary rounded text-sm hover:bg-blue-50 transition-colors"
            >
              Send Questionnaire
            </button>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => { clearSendBanners(); setSubject(e.target.value); }}
              className="w-full border border-border rounded px-3 py-2 text-sm"
              placeholder="Enter email subject..."
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium mb-1">Message</label>
            <textarea
              value={messageBody}
              onChange={(e) => { clearSendBanners(); setMessageBody(e.target.value); }}
              className="w-full border border-border rounded px-3 py-2 text-sm font-mono"
              rows={12}
              placeholder="Enter your message..."
            />
          </div>

          {/* Channel selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Send Via</label>
            <div className="flex gap-4">
              <label className={`flex items-center gap-1.5 text-sm ${attachPersonalSchedule ? "text-muted cursor-not-allowed" : "cursor-pointer"}`} title="Send to both email AND text (players with both get both)">
                <input type="radio" name="channel" value="both" checked={channel === "both"} disabled={attachPersonalSchedule} onChange={() => setChannel("both")} />
                Email + Text
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" title="Email only to all players with an email address">
                <input type="radio" name="channel" value="email" checked={channel === "email"} onChange={() => setChannel("email")} />
                Email only
              </label>
              <label className={`flex items-center gap-1.5 text-sm ${attachPersonalSchedule ? "text-muted cursor-not-allowed" : "cursor-pointer"}`} title="Prefer text; players without phone+carrier get email instead">
                <input type="radio" name="channel" value="sms" checked={channel === "sms"} disabled={attachPersonalSchedule} onChange={() => setChannel("sms")} />
                Text only
              </label>
            </div>
            <p className="text-xs text-muted mt-1">
              {attachPersonalSchedule && "Calendar attachments require an email client — channel is locked to Email only."}
              {!attachPersonalSchedule && channel === "both" && "Players get email AND text if both are configured. Players with only one channel get that one."}
              {!attachPersonalSchedule && channel === "email" && "All players with email receive an email."}
              {!attachPersonalSchedule && channel === "sms" && "Players with phone+carrier get text. Players without get email as fallback."}
            </p>
          </div>

          {/* Include personal calendar link */}
          <div>
            <label
              className="flex items-center gap-2 text-sm cursor-pointer"
              title="Append a per-player webcal:// subscription link. The recipient clicks it and their calendar app creates a separate, toggleable 'Brooklake Tennis' calendar that auto-updates."
            >
              <input
                type="checkbox"
                checked={attachPersonalSchedule}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAttachPersonalSchedule(checked);
                  if (checked) setChannel("email"); // force email-only — calendar links only make sense in email clients
                }}
              />
              Include personal calendar link
            </label>
            <p className="text-xs text-muted mt-1">
              Appends a <code>webcal://</code> link at the bottom of each email. When clicked, the
              recipient&apos;s calendar app subscribes and creates a separate <strong>Brooklake
              Tennis</strong> calendar that can be toggled on/off independently from their personal
              calendar — and auto-updates if the schedule changes. Games where they bring balls are
              marked with an asterisk.
            </p>

            {/* Test-as-player dropdown: only visible when Test + link */}
            {attachPersonalSchedule && recipientGroup === "Test" && activePlayers.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                <label className="block text-xs font-medium mb-1 text-blue-900">
                  Test as player
                </label>
                <select
                  value={testAsPlayerId ?? ""}
                  onChange={(e) => setTestAsPlayerId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full border border-blue-300 rounded px-3 py-1.5 text-sm bg-white"
                  title="Which player's calendar link to generate and send to the test email"
                >
                  {activePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.lastName}, {p.firstName}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-blue-700 mt-1">
                  A link to this player&apos;s calendar will be sent to {testEmail || "(test email not set)"}.
                </p>
                <label className="mt-2 flex items-center gap-2 text-xs text-blue-900 cursor-pointer" title="Preview mode — subscribing only adds one event instead of the full season">
                  <input
                    type="checkbox"
                    checked={testFirstEventOnly}
                    onChange={(e) => setTestFirstEventOnly(e.target.checked)}
                  />
                  Preview mode: subscription shows only the first game
                </label>
              </div>
            )}
          </div>

          {/* File attachments */}
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <label
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded cursor-pointer hover:bg-muted-bg"
                title={
                  channel === "sms"
                    ? "Switch channel to Email or Both to attach files"
                    : "Attach one or more files (PDFs, etc.) to the outgoing email"
                }
              >
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={channel === "sms"}
                  onChange={(e) => {
                    clearSendBanners();
                    const picked = Array.from(e.target.files ?? []);
                    if (picked.length > 0) {
                      setAttachedFiles((prev) => [...prev, ...picked]);
                    }
                    // Reset the input so picking the same file twice triggers onChange
                    e.target.value = "";
                  }}
                />
                <span>+ Attach files</span>
              </label>
              {attachedFiles.length > 0 && (
                <span
                  className={`text-xs ${
                    attachedTotalBytes > ATTACH_MAX_BYTES
                      ? "text-red-600 font-medium"
                      : attachedTotalBytes > ATTACH_WARN_BYTES
                        ? "text-orange-600"
                        : "text-muted"
                  }`}
                >
                  {attachedFiles.length} file{attachedFiles.length !== 1 ? "s" : ""} &middot;{" "}
                  {formatBytes(attachedTotalBytes)}
                  {attachedTotalBytes > ATTACH_MAX_BYTES &&
                    ` — exceeds ${formatBytes(ATTACH_MAX_BYTES)} limit`}
                  {attachedTotalBytes > ATTACH_WARN_BYTES &&
                    attachedTotalBytes <= ATTACH_MAX_BYTES &&
                    " — large total, may be rejected by some mail servers"}
                </span>
              )}
            </div>

            {attachedFiles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {attachedFiles.map((f, idx) => (
                  <li
                    key={`${f.name}-${idx}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-muted hover:text-red-600"
                      title="Remove this attachment"
                      aria-label={`Remove ${f.name}`}
                    >
                      ×
                    </button>
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted">{formatBytes(f.size)}</span>
                  </li>
                ))}
              </ul>
            )}

            {channel === "sms" && attachedFiles.length > 0 && (
              <p className="text-xs text-orange-600 mt-1">
                SMS cannot carry attachments — these files will not be sent.
              </p>
            )}
          </div>

          {/* Send */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSend}
              disabled={sending || !subject.trim() || !messageBody.trim() || (recipientGroup === "Test" && !testEmail && !(testPhone && testCarrier))}
              className="px-6 py-2 bg-primary text-white rounded font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? "Sending..." : "Send"}
            </button>

            {recipientCount > 100 && recipientGroup !== "Test" && (
              <span className="text-sm text-amber-600">
                ⚠ {recipientCount} recipients. Gmail SMTP free tier allows 500 emails/day.
              </span>
            )}
          </div>

          {/* Sending indicator */}
          {sending && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded px-4 py-3">
              <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div className="text-sm text-blue-800">
                <div className="font-medium">Sending messages… please don&apos;t close this tab.</div>
                <div className="text-xs text-blue-600 mt-0.5">
                  {attachPersonalSchedule
                    ? "Generating a personalized calendar for each recipient. This can take up to a minute for a full roster."
                    : "This usually takes just a few seconds."}
                </div>
              </div>
            </div>
          )}

          {/* Success banner */}
          {sendMessage && !sending && (
            <div className="bg-green-50 border border-green-300 rounded px-4 py-3">
              <div className="text-green-800 font-medium">{sendMessage}</div>
              {sendWarnings.length === 0 && (
                <div className="text-xs text-green-700 mt-1">All messages delivered without errors.</div>
              )}
            </div>
          )}

          {/* Error banner (network/total failure) */}
          {sendError && !sending && (
            <div className="bg-red-50 border border-red-300 rounded px-4 py-3">
              <div className="text-red-800 font-medium">{sendError}</div>
            </div>
          )}

          {/* Warnings / per-recipient issue log */}
          {sendWarnings.length > 0 && !sending && (
            <div className="bg-amber-50 border border-amber-300 rounded px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-amber-900 font-medium text-sm">
                  ⚠ {sendWarnings.length} issue{sendWarnings.length !== 1 ? "s" : ""} encountered
                </div>
                <button
                  onClick={() => setSendWarnings([])}
                  className="text-xs text-amber-700 hover:underline"
                  title="Dismiss this error log"
                >
                  Dismiss
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto text-xs text-amber-900 space-y-1 font-mono">
                {sendWarnings.map((w, i) => (
                  <div key={i} className="pl-2 border-l-2 border-amber-300">{w}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TEMPLATES TAB ===== */}
      {activeTab === "templates" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Email Templates</h2>
            <button
              onClick={() => {
                setShowTemplateForm(true);
                setEditingTemplateId(null);
                setTemplateForm({ name: "", subject: "", body: "" });
              }}
              className="px-3 py-1.5 bg-primary text-white rounded text-sm hover:opacity-90"
            >
              + New Template
            </button>
          </div>

          {templateMessage && (
            <p className="text-sm text-green-600 mb-3">{templateMessage}</p>
          )}

          {/* Template form */}
          {showTemplateForm && (
            <div className="border border-border rounded-lg p-4 mb-4 bg-gray-50">
              <h3 className="text-sm font-semibold mb-3">
                {editingTemplateId ? "Edit Template" : "New Template"}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Template Name</label>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    className="w-full border border-border rounded px-3 py-1.5 text-sm"
                    placeholder="e.g., Rain Cancellation"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Subject</label>
                  <input
                    type="text"
                    value={templateForm.subject}
                    onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                    className="w-full border border-border rounded px-3 py-1.5 text-sm"
                    placeholder="Email subject..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Body</label>
                  <textarea
                    value={templateForm.body}
                    onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                    className="w-full border border-border rounded px-3 py-1.5 text-sm font-mono"
                    rows={8}
                    placeholder="Message body..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTemplate}
                    className="px-3 py-1.5 bg-primary text-white rounded text-sm hover:opacity-90"
                  >
                    {editingTemplateId ? "Update" : "Save"} Template
                  </button>
                  <button
                    onClick={() => {
                      setShowTemplateForm(false);
                      setEditingTemplateId(null);
                      setTemplateForm({ name: "", subject: "", body: "" });
                    }}
                    className="px-3 py-1.5 border border-border rounded text-sm hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Template list */}
          {templates.length === 0 ? (
            <p className="text-sm text-muted">No templates saved yet.</p>
          ) : (
            <div className="border border-border rounded overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-2 bg-gray-100 text-xs font-semibold text-muted uppercase">
                <span>Name</span>
                <span>Subject</span>
                <span>Actions</span>
              </div>
              {templates.map((t, idx) => (
                <div
                  key={t.id}
                  className={`grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-2 text-sm items-center ${
                    idx % 2 === 0 ? "bg-white" : "bg-[#fdf8f0]"
                  }`}
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-muted truncate">{t.subject}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLoadTemplate(t)}
                      className="text-primary hover:underline text-xs"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleEditTemplate(t)}
                      className="text-primary hover:underline text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(t.id, t.name)}
                      className="text-red-600 hover:underline text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== HISTORY TAB ===== */}
      {activeTab === "history" && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Email History</h2>

          {history.length === 0 ? (
            <p className="text-sm text-muted">No emails sent yet.</p>
          ) : (
            <div className="border border-border rounded overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[140px_1fr_120px_60px_120px] gap-2 px-4 py-2 bg-gray-100 text-xs font-semibold text-muted uppercase">
                <span>Date</span>
                <span>Subject</span>
                <span>Group</span>
                <span>Sent</span>
                <span>From</span>
              </div>
              {history.map((h, idx) => (
                <div key={h.id}>
                  <div
                    className={`grid grid-cols-[140px_1fr_120px_60px_120px] gap-2 px-4 py-2 text-sm items-center cursor-pointer hover:bg-gray-50 ${
                      idx % 2 === 0 ? "bg-white" : "bg-[#fdf8f0]"
                    }`}
                    onClick={() => setExpandedHistoryId(expandedHistoryId === h.id ? null : h.id)}
                  >
                    <span className="text-xs">{formatDateTime(h.sentAt)}</span>
                    <span className="truncate">{h.subject}</span>
                    <span className="text-muted text-xs">{h.recipientGroup}</span>
                    <span className="text-muted text-xs">{h.recipientCount}</span>
                    <span className="text-muted text-xs truncate">{h.fromName}</span>
                  </div>
                  {expandedHistoryId === h.id && (
                    <div className="px-4 py-3 bg-gray-50 border-t border-border text-sm space-y-2">
                      <div>
                        <strong className="text-xs text-muted">Reply-To:</strong>{" "}
                        <span className="text-xs">{h.replyTo || "—"}</span>
                      </div>
                      <div>
                        <strong className="text-xs text-muted">Recipients:</strong>{" "}
                        <span className="text-xs">{h.recipientList}</span>
                      </div>
                      <div>
                        <strong className="text-xs text-muted">Message:</strong>
                        <pre className="mt-1 text-xs whitespace-pre-wrap font-mono bg-white p-2 rounded border border-border">
                          {h.body}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
