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

type RecipientGroup = "ALL" | "Contract Players" | "Subs" | "Test";
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
    const res = await fetch(`/api/communications/recipients?seasonId=${seasonId}&group=${group}`);
    const data = (await res.json()) as { recipients: Recipient[]; count: number; message?: string };
    setRecipients(data.recipients);
    setRecipientCount(data.count);
  }, []);

  // Load templates
  const loadTemplates = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/communications/templates?seasonId=${seasonId}`);
    const data = (await res.json()) as Template[];
    setTemplates(data);
  }, []);

  // Load history
  const loadHistory = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/communications/history?seasonId=${seasonId}`);
    const data = (await res.json()) as HistoryEntry[];
    setHistory(data);
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
    }
  }, [season, loadSettings, loadRecipients, loadTemplates, loadHistory, recipientGroup]);

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
  const handleSend = async () => {
    if (!season || !subject.trim() || !messageBody.trim()) return;

    const channelLabel = channel === "email" ? "Email only" : channel === "sms" ? "Text only" : "Email + Text";
    const confirmMsg = recipientGroup === "Test"
      ? `Send test (${channelLabel})?`
      : `Send "${channelLabel}" to ${recipientCount} recipient${recipientCount !== 1 ? "s" : ""} (${recipientGroup})?\n\nSubject: ${subject}`;

    if (!window.confirm(confirmMsg)) return;

    setSending(true);
    setSendMessage("");
    setSendError("");

    try {
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

        if (data.warnings && data.warnings.length > 0) {
          if ((data.recipientCount ?? 0) === 0) {
            setSendError(`All messages failed to send.\n${data.warnings.join("\n")}`);
          } else {
            setSendMessage(`Sent: ${summary}.`);
            setSendError(`Some messages failed:\n${data.warnings.join("\n")}`);
          }
        } else {
          setSendMessage(`Sent: ${summary}.`);
        }
        // Refresh history
        loadHistory(season.id);
      } else {
        setSendError(data.error || "Failed to send message.");
      }
    } catch {
      setSendError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Template CRUD
  const handleSaveTemplate = async () => {
    if (!season) return;
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
        loadTemplates(season.id);
      }
    } else {
      // Create
      const res = await fetch("/api/communications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: season.id, ...templateForm }),
      });
      if (res.ok) {
        setTemplateMessage("Template created.");
        setShowTemplateForm(false);
        setTemplateForm({ name: "", subject: "", body: "" });
        loadTemplates(season.id);
      }
    }
    setTimeout(() => setTemplateMessage(""), 3000);
  };

  const handleDeleteTemplate = async (id: number, name: string) => {
    if (!season) return;
    if (!window.confirm(`Delete template "${name}"?`)) return;
    await fetch(`/api/communications/templates?id=${id}`, { method: "DELETE" });
    loadTemplates(season.id);
  };

  const handleLoadTemplate = (template: Template) => {
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
              {(["ALL", "Contract Players", "Subs", "Test"] as RecipientGroup[]).map((group) => (
                <label key={group} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="recipientGroup"
                    value={group}
                    checked={recipientGroup === group}
                    onChange={() => setRecipientGroup(group)}
                  />
                  {group}
                </label>
              ))}
            </div>

            {/* Recipient count + preview */}
            <div className="mt-2 flex items-center gap-3">
              <span className="text-sm text-muted">
                {recipientGroup === "Test"
                  ? testEmail
                    ? `Test email: ${testEmail}`
                    : "No test email configured"
                  : `${recipientCount} recipient${recipientCount !== 1 ? "s" : ""}`}
              </span>
              {recipientCount > 0 && recipientGroup !== "Test" && (
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
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-border rounded px-3 py-2 text-sm"
              placeholder="Enter email subject..."
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium mb-1">Message</label>
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              className="w-full border border-border rounded px-3 py-2 text-sm font-mono"
              rows={12}
              placeholder="Enter your message..."
            />
          </div>

          {/* Channel selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Send Via</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" title="Send to both email AND text (players with both get both)">
                <input type="radio" name="channel" value="both" checked={channel === "both"} onChange={() => setChannel("both")} />
                Email + Text
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" title="Email only to all players with an email address">
                <input type="radio" name="channel" value="email" checked={channel === "email"} onChange={() => setChannel("email")} />
                Email only
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" title="Prefer text; players without phone+carrier get email instead">
                <input type="radio" name="channel" value="sms" checked={channel === "sms"} onChange={() => setChannel("sms")} />
                Text only
              </label>
            </div>
            <p className="text-xs text-muted mt-1">
              {channel === "both" && "Players get email AND text if both are configured. Players with only one channel get that one."}
              {channel === "email" && "All players with email receive an email."}
              {channel === "sms" && "Players with phone+carrier get text. Players without get email as fallback."}
            </p>
          </div>

          {/* Attach personal schedule (.ics) */}
          <div>
            <label
              className={`flex items-center gap-2 text-sm ${channel === "sms" ? "text-muted cursor-not-allowed" : "cursor-pointer"}`}
              title="Attach each player's personalized game schedule as a .ics file they can import into their calendar"
            >
              <input
                type="checkbox"
                checked={channel !== "sms" && attachPersonalSchedule}
                disabled={channel === "sms"}
                onChange={(e) => setAttachPersonalSchedule(e.target.checked)}
              />
              Attach personal schedule (.ics)
            </label>
            <p className="text-xs text-muted mt-1">
              Each email recipient gets their own Brooklake Tennis calendar file with all season games.
              Games where they bring balls are marked with an asterisk. {channel === "sms" && "(Not available for text-only.)"}
            </p>
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

          {sendMessage && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">
              {sendMessage}
            </p>
          )}
          {sendError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 whitespace-pre-line">
              {sendError}
            </p>
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
