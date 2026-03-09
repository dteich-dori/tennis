"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface CourtSlot {
  id: number;
  seasonId: number;
  dayOfWeek: number;
  courtNumber: number;
  startTime: string;
  isSolo: boolean;
}

interface Season {
  id: number;
  startDate: string;
  endDate: string;
}

export default function CourtsPage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [courts, setCourts] = useState<CourtSlot[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [courtNumber, setCourtNumber] = useState(1);
  const [startTime, setStartTime] = useState("10:30");
  const [isSolo, setIsSolo] = useState(false);
  const [formError, setFormError] = useState("");

  // Import CSV state (hooks must be before any early return)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<
    { dayOfWeek: number; courtNumber: number; startTime: string; isSolo: boolean }[] | null
  >(null);
  const [importError, setImportError] = useState("");
  const [exportMessage, setExportMessage] = useState("");

  const loadSeason = useCallback(async () => {
    const res = await fetch("/api/seasons");
    const data = (await res.json()) as Season[];
    if (data.length > 0) {
      setSeason(data[data.length - 1]);
    }
  }, []);

  const loadCourts = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/courts?seasonId=${seasonId}`);
    const data = (await res.json()) as CourtSlot[];
    setCourts(data);
  }, []);

  useEffect(() => {
    loadSeason();
  }, [loadSeason]);

  useEffect(() => {
    if (season) loadCourts(season.id);
  }, [season, loadCourts]);

  const resetForm = () => {
    setDayOfWeek(1);
    setCourtNumber(1);
    setStartTime("10:30");
    setIsSolo(false);
    setEditingId(null);
    setFormError("");
  };

  const handleSave = async () => {
    if (!season) return;
    setFormError("");

    let res;
    if (editingId) {
      res = await fetch("/api/courts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, dayOfWeek, courtNumber, startTime, isSolo }),
      });
    } else {
      res = await fetch("/api/courts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: season.id, dayOfWeek, courtNumber, startTime, isSolo }),
      });
    }

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setFormError(data.error ?? "Failed to save court slot.");
      return;
    }

    resetForm();
    await loadCourts(season.id);
  };

  const handleEdit = (slot: CourtSlot) => {
    setEditingId(slot.id);
    setDayOfWeek(slot.dayOfWeek);
    setCourtNumber(slot.courtNumber);
    setStartTime(slot.startTime);
    setIsSolo(slot.isSolo);
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/courts?id=${id}`, { method: "DELETE" });
    if (season) await loadCourts(season.id);
  };

  if (!season) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Court Schedule</h1>
        <p className="text-muted">
          Please <a href="/season" className="text-primary underline">create a season</a> first.
        </p>
      </div>
    );
  }

  const sortedCourts = [...courts].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return a.courtNumber - b.courtNumber;
  });

  const handleExportCsv = async () => {
    if (sortedCourts.length === 0) return;
    const header = "Day,Court #,Start Time,Group";
    const rows = sortedCourts.map(
      (s) =>
        `${DAYS[s.dayOfWeek]},${s.courtNumber},${s.startTime},${s.isSolo ? "Solo" : "Don's"}`
    );
    const csv = [header, ...rows].join("\n");

    // Save to Backup/ directory on server
    setExportMessage("");
    try {
      const res = await fetch("/api/export-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "court-schedule.csv", content: csv }),
      });
      const data = (await res.json()) as { success?: boolean; filename?: string; error?: string };
      if (res.ok && data.success) {
        setExportMessage(`Court schedule CSV saved to Backup/${data.filename}`);
      } else {
        setExportMessage(`Export failed: ${data.error ?? "Unknown error"}`);
      }
    } catch (err) {
      setExportMessage(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Parse court CSV text (shared by file import and backup import)
  const parseCourtCsv = (text: string): { dayOfWeek: number; courtNumber: number; startTime: string; isSolo: boolean }[] | string => {
    const lines = text.trim().split("\n").filter((l) => l.trim());
    const startIdx = lines[0]?.toLowerCase().includes("day") ? 1 : 0;
    const parsed: { dayOfWeek: number; courtNumber: number; startTime: string; isSolo: boolean }[] = [];

    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      if (cols.length < 4) continue;

      const dayName = cols[0];
      const dayIdx = DAYS.findIndex(
        (d) => d.toLowerCase() === dayName.toLowerCase()
      );
      if (dayIdx < 0) return `Row ${i + 1}: Unknown day "${dayName}"`;

      const court = parseInt(cols[1]);
      if (isNaN(court) || court < 1 || court > 6) return `Row ${i + 1}: Invalid court number "${cols[1]}"`;

      const time = cols[2];
      if (!/^\d{1,2}:\d{2}$/.test(time)) return `Row ${i + 1}: Invalid time format "${cols[2]}"`;

      const groupText = cols[3].toLowerCase();
      const solo = groupText === "solo";

      parsed.push({ dayOfWeek: dayIdx, courtNumber: court, startTime: time, isSolo: solo });
    }

    if (parsed.length === 0) return "No valid rows found in CSV file.";
    return parsed;
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const result = parseCourtCsv(text);
        if (typeof result === "string") {
          setImportError(result);
          setImportPreview(null);
        } else {
          setImportPreview(result);
        }
      } catch {
        setImportError("Failed to parse CSV file.");
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImportFromBackup = async () => {
    setImportError("");

    try {
      const res = await fetch("/api/backup/read?file=court-schedule.csv");
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || !data.content) {
        setImportError(data.error ?? "No court-schedule.csv found in Backup folder.");
        return;
      }

      const result = parseCourtCsv(data.content);
      if (typeof result === "string") {
        setImportError(result);
        setImportPreview(null);
      } else {
        setImportPreview(result);
      }
    } catch {
      setImportError("Failed to read from Backup folder.");
    }
  };

  const handleImportConfirm = async () => {
    if (!season || !importPreview) return;

    // Delete all existing court slots
    for (const slot of courts) {
      await fetch(`/api/courts?id=${slot.id}`, { method: "DELETE" });
    }

    // Add each imported slot
    for (const slot of importPreview) {
      await fetch("/api/courts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: season.id,
          dayOfWeek: slot.dayOfWeek,
          courtNumber: slot.courtNumber,
          startTime: slot.startTime,
          isSolo: slot.isSolo,
        }),
      });
    }

    setImportPreview(null);
    setImportError("");
    await loadCourts(season.id);
  };

  const handleImportCancel = () => {
    setImportPreview(null);
    setImportError("");
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Court Schedule</h1>

      {/* Add/Edit form */}
      <div className="border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-4">
          {editingId ? "Edit Court Slot" : "Add Court Slot"}
        </h2>
        {formError && (
          <div className="text-danger text-sm mb-3">{formError}</div>
        )}
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-sm text-muted mb-1">Day</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
              className="border border-border rounded px-3 py-2 text-sm"
            >
              {DAYS.map((day, i) => (
                <option key={i} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Court #</label>
            <select
              value={courtNumber}
              onChange={(e) => setCourtNumber(parseInt(e.target.value))}
              className="border border-border rounded px-3 py-2 text-sm"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="border border-border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              id="isSolo"
              checked={isSolo}
              onChange={(e) => setIsSolo(e.target.checked)}
            />
            <label htmlFor="isSolo" className="text-sm">
              Solo Group
            </label>
          </div>
          <button
            onClick={handleSave}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
          >
            {editingId ? "Update" : "Add"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="text-sm text-muted hover:underline pb-2"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Court slots table */}
      {sortedCourts.length === 0 ? (
        <p className="text-muted text-sm">No court slots added yet.</p>
      ) : (
        <table className="w-full text-sm border border-border">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left p-3 border-b border-border">Day</th>
              <th className="text-left p-3 border-b border-border">Court #</th>
              <th className="text-left p-3 border-b border-border">Start Time</th>
              <th className="text-left p-3 border-b border-border">Group</th>
              <th className="text-left p-3 border-b border-border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedCourts.map((slot) => (
              <tr key={slot.id} className="border-b border-border">
                <td className="p-3">{DAYS[slot.dayOfWeek]}</td>
                <td className="p-3">{slot.courtNumber}</td>
                <td className="p-3">{slot.startTime}</td>
                <td className="p-3">
                  {slot.isSolo ? (
                    <span className="text-solo-orange font-medium">Solo</span>
                  ) : (
                    "Don's"
                  )}
                </td>
                <td className="p-3 flex gap-3">
                  <button
                    onClick={() => handleEdit(slot)}
                    className="text-primary hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(slot.id)}
                    className="text-danger hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* Button bar and count */}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleImportClick}
          className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
        >
          Import CSV
        </button>
        <button
          onClick={handleImportFromBackup}
          className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
        >
          Import from Backup
        </button>
        {sortedCourts.length > 0 && (
          <button
            onClick={handleExportCsv}
            className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
          >
            Export CSV
          </button>
        )}
        <span className="text-xs text-muted ml-2">
          {courts.length} court slot{courts.length !== 1 ? "s" : ""} configured
        </span>
      </div>
      {exportMessage && (
        <p className={`text-sm mt-2 ${exportMessage.startsWith("Export failed") ? "text-danger" : "text-green-600"}`}>
          {exportMessage}
        </p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Import error */}
      {importError && (
        <div className="mt-3 text-danger text-sm">{importError}</div>
      )}

      {/* Import confirmation dialog */}
      {importPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-3">Import Court Schedule</h3>
            <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm mb-4">
              <span className="font-semibold">Warning:</span> This will delete all{" "}
              <span className="font-semibold">{courts.length}</span> existing court slot
              {courts.length !== 1 ? "s" : ""} and replace them with{" "}
              <span className="font-semibold">{importPreview.length}</span> slot
              {importPreview.length !== 1 ? "s" : ""} from the CSV file.
            </div>
            <table className="w-full text-sm border border-border mb-4">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 border-b border-border">Day</th>
                  <th className="text-left px-3 py-2 border-b border-border">Court #</th>
                  <th className="text-left px-3 py-2 border-b border-border">Time</th>
                  <th className="text-left px-3 py-2 border-b border-border">Group</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((s, i) => (
                  <tr key={i} className={i % 2 ? "bg-gray-50/50" : ""}>
                    <td className="px-3 py-1.5 border-b border-border">{DAYS[s.dayOfWeek]}</td>
                    <td className="px-3 py-1.5 border-b border-border">{s.courtNumber}</td>
                    <td className="px-3 py-1.5 border-b border-border">{s.startTime}</td>
                    <td className="px-3 py-1.5 border-b border-border">
                      {s.isSolo ? (
                        <span className="text-solo-orange font-medium">Solo</span>
                      ) : (
                        "Don's"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleImportCancel}
                className="px-4 py-2 rounded text-sm border border-border hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImportConfirm}
                className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
              >
                Replace All &amp; Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
