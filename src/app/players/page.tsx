"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatPhone } from "@/lib/formatPhone";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Player {
  id: number;
  seasonId: number;
  firstName: string;
  lastName: string;
  cellNumber: string | null;
  homeNumber: string | null;
  email: string | null;
  isActive: boolean;
  contractedFrequency: string;
  skillLevel: string;
  noConsecutiveDays: boolean;
  isDerated: boolean;
  noEarlyGames: boolean;
  cGamesOk: boolean;
  soloGames: number | null;
  blockedDays: number[];
  vacations: { id: number; startDate: string; endDate: string }[];
  doNotPair: number[];
}

interface Season {
  id: number;
  startDate: string;
  endDate: string;
}

interface VacationRange {
  startDate: string;
  endDate: string; // Last day of vacation
}

const emptyPlayer = {
  firstName: "",
  lastName: "",
  cellNumber: "",
  homeNumber: "",
  email: "",
  isActive: true,
  contractedFrequency: "1",
  skillLevel: "C",
  noConsecutiveDays: false,
  isDerated: false,
  noEarlyGames: false,
  cGamesOk: false,
  soloGames: null as number | null,
  blockedDays: [] as number[],
  vacations: [] as VacationRange[],
  doNotPair: [] as number[],
};

export default function PlayersPage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyPlayer);
  const [formError, setFormError] = useState("");
  const [sortField, setSortField] = useState<"lastName" | "firstName" | "skillLevel" | "contractedFrequency">("lastName");
  const [sortAsc, setSortAsc] = useState(true);
  const [importMessage, setImportMessage] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<
    { firstName: string; lastName: string; cellNumber: string | null; homeNumber: string | null; email: string | null;
      skillLevel: string | null; contractedFrequency: string | null; soloGames: number | null;
      isActive: boolean | null; isDerated: boolean | null; noConsecutiveDays: boolean | null;
      blockedDays: number[]; vacations: { startDate: string; endDate: string }[]; doNotPairNames: string[];
    }[] | null
  >(null);
  const [importFileName, setImportFileName] = useState("");
  const [importIsFullBackup, setImportIsFullBackup] = useState(false);

  const loadSeason = useCallback(async () => {
    const res = await fetch("/api/seasons");
    const data = (await res.json()) as Season[];
    if (data.length > 0) setSeason(data[data.length - 1]);
  }, []);

  const loadPlayers = useCallback(async (seasonId: number) => {
    const res = await fetch(`/api/players?seasonId=${seasonId}`);
    const data = (await res.json()) as Player[];
    setPlayers(data);
  }, []);

  useEffect(() => {
    loadSeason();
  }, [loadSeason]);

  useEffect(() => {
    if (season) loadPlayers(season.id);
  }, [season, loadPlayers]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const filteredPlayers = showInactive ? players : players.filter((p) => p.isActive);
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    const aVal = a[sortField] ?? "";
    const bVal = b[sortField] ?? "";
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortAsc ? cmp : -cmp;
  });

  const resetForm = () => {
    setForm(emptyPlayer);
    setFormError("");
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (player: Player) => {
    setForm({
      firstName: player.firstName,
      lastName: player.lastName,
      cellNumber: player.cellNumber ?? "",
      homeNumber: player.homeNumber ?? "",
      email: player.email ?? "",
      isActive: player.isActive,
      contractedFrequency: player.contractedFrequency,
      skillLevel: player.skillLevel,
      noConsecutiveDays: player.noConsecutiveDays,
      isDerated: player.isDerated,
      noEarlyGames: player.noEarlyGames,
      cGamesOk: player.cGamesOk,
      soloGames: player.soloGames ?? null,
      blockedDays: player.blockedDays,
      vacations: player.vacations.map((v) => ({
        startDate: v.startDate,
        endDate: v.endDate,
      })),
      doNotPair: player.doNotPair ?? [],
    });
    setEditingId(player.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    setFormError("");
    if (!season) return;
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError("First name and last name are required.");
      return;
    }

    const invalidVacation = form.vacations.find(
      (v) => v.startDate && v.endDate && v.endDate < v.startDate
    );
    if (invalidVacation) {
      setFormError("Vacation last day cannot be before the start date.");
      return;
    }

    const payload = {
      ...form,
      seasonId: season.id,
      cellNumber: form.cellNumber || null,
      homeNumber: form.homeNumber || null,
      email: form.email || null,
      soloGames: form.soloGames || null,
      vacations: form.vacations.filter((v) => v.startDate && v.endDate),
      doNotPair: form.doNotPair,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = editingId
        ? await fetch("/api/players", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...payload }),
            signal: controller.signal,
          })
        : await fetch("/api/players", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        setFormError(err.error || "Failed to save player");
        return;
      }

      resetForm();
      // Small delay to let SQLite finish writing before reading
      await new Promise((r) => setTimeout(r, 100));
      await loadPlayers(season.id);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setFormError("Save timed out — the server may be busy. Please try again.");
      } else {
        setFormError("Failed to save player. Please try again.");
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!season) return;
    const player = players.find((p) => p.id === id);
    if (!player) return;

    const fullName = `${player.firstName} ${player.lastName}`;
    const typed = window.prompt(
      `PERMANENT DELETE: This will remove ${fullName} and all their assignments, vacations, blocked days, and pairings.\n\nType "${fullName}" to confirm:`
    );
    if (typed !== fullName) {
      if (typed !== null) {
        alert("Name did not match. Delete cancelled.");
      }
      return;
    }

    try {
      await fetch(`/api/players?id=${id}`, { method: "DELETE" });
      await new Promise((r) => setTimeout(r, 100));
      await loadPlayers(season.id);
    } catch (err) {
      console.error("Failed to delete player:", err);
    }
  };

  const toggleBlockedDay = (day: number) => {
    setForm((prev) => ({
      ...prev,
      blockedDays: prev.blockedDays.includes(day)
        ? prev.blockedDays.filter((d) => d !== day)
        : [...prev.blockedDays, day],
    }));
  };

  if (!season) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Players</h1>
        <p className="text-muted">
          Please <a href="/season" className="text-primary underline">create a season</a> first.
        </p>
      </div>
    );
  }

  // Parse CSV text into player rows (shared by file import and backup import)
  const parsePlayerCsv = (text: string): { parsed: typeof importPreview; isFullBackup: boolean } | null => {
    // Remove BOM if present
    const clean = text.replace(/^\uFEFF/, "");
    const lines = clean.split(/\r?\n/);
    const dataLines = lines.slice(1);

    interface ParsedPlayer {
      firstName: string;
      lastName: string;
      cellNumber: string | null;
      homeNumber: string | null;
      email: string | null;
      skillLevel: string | null;
      contractedFrequency: string | null;
      soloGames: number | null;
      isActive: boolean | null;
      isDerated: boolean | null;
      noConsecutiveDays: boolean | null;
      noEarlyGames: boolean | null;
      blockedDays: number[];
      vacations: { startDate: string; endDate: string }[];
      doNotPairNames: string[];
    }

    const parsed: ParsedPlayer[] = [];
    const headerLine = lines[0]?.toLowerCase() ?? "";
    const isFullBackup = headerLine.includes("skill") && headerLine.includes("frequency");

    for (const line of dataLines) {
      if (!line.trim()) continue;

      const fields: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      fields.push(current.trim());

      const [lastName, firstName, cell, home, email] = fields;

      if (!lastName || !firstName) continue;
      const upperLast = lastName.replace(/[^A-Za-z]/g, "").toUpperCase();
      if (upperLast === "HOLIDAY" || upperLast === "GAME" || upperLast === "TBD") continue;
      if (firstName.toUpperCase() === "TBD" || firstName.toUpperCase() === "OPEN") continue;
      if (/^<+\d+>+$/.test(lastName.trim())) continue;

      const cleanLast = lastName.replace(/[■`]/g, "").trim();
      const cleanFirst = firstName.replace(/[■`]/g, "").trim();
      if (!cleanLast || !cleanFirst) continue;

      const player: ParsedPlayer = {
        firstName: cleanFirst,
        lastName: cleanLast,
        cellNumber: cell || null,
        homeNumber: home || null,
        email: email || null,
        skillLevel: null,
        contractedFrequency: null,
        soloGames: null,
        isActive: null,
        isDerated: null,
        noConsecutiveDays: null,
        noEarlyGames: null,
        blockedDays: [],
        vacations: [],
        doNotPairNames: [],
      };

      if (isFullBackup) {
        const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

        const skill = fields[5] ?? "";
        if (["A", "B", "C", "D"].includes(skill)) player.skillLevel = skill;

        const freq = fields[6] ?? "";
        if (freq === "Sub") player.contractedFrequency = "0";
        else if (["1", "2", "2+"].includes(freq)) player.contractedFrequency = freq;

        const soloRaw = (fields[7] ?? "").trim().toLowerCase();
        if (soloRaw === "full") player.soloGames = 36;
        else if (soloRaw === "half") player.soloGames = 18;
        else { const n = parseInt(soloRaw); if (!isNaN(n) && n >= 1 && n <= 36) player.soloGames = n; }

        const active = (fields[9] ?? "").toLowerCase();
        if (active === "yes") player.isActive = true;
        else if (active === "no") player.isActive = false;

        const derated = (fields[10] ?? "").toLowerCase();
        if (derated === "yes") player.isDerated = true;
        else if (derated === "no") player.isDerated = false;

        const noConsec = (fields[11] ?? "").toLowerCase();
        if (noConsec === "yes") player.noConsecutiveDays = true;
        else if (noConsec === "no") player.noConsecutiveDays = false;

        const noEarly = (fields[12] ?? "").toLowerCase();
        if (noEarly === "yes") player.noEarlyGames = true;
        else if (noEarly === "no") player.noEarlyGames = false;

        const blockedStr = fields[13] ?? "";
        if (blockedStr) {
          player.blockedDays = blockedStr.split(";").map((d) => DAY_MAP[d.trim()]).filter((d) => d !== undefined);
        }

        const vacStr = fields[14] ?? "";
        if (vacStr) {
          player.vacations = vacStr.split(";").map((v) => {
            const parts = v.trim().split(" to ");
            return parts.length === 2 && parts[0] && parts[1]
              ? { startDate: parts[0].trim(), endDate: parts[1].trim() }
              : null;
          }).filter((v): v is { startDate: string; endDate: string } => v !== null);
        }

        const dnpStr = fields[15] ?? "";
        if (dnpStr) {
          player.doNotPairNames = dnpStr.split(";").map((n) => n.trim()).filter(Boolean);
        }
      }

      parsed.push(player);
    }

    if (parsed.length === 0) return null;
    return { parsed, isFullBackup };
  };

  const handleCsvFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !season) return;
    setImportMessage("");

    const text = await file.text();
    const result = parsePlayerCsv(text);
    if (!result) {
      setImportMessage("No valid player rows found in the CSV file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImportPreview(result.parsed);
    setImportIsFullBackup(result.isFullBackup);
    setImportFileName(file.name);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportFromBackup = async () => {
    if (!season) return;
    setImportMessage("");

    try {
      const res = await fetch("/api/backup/read?file=players.csv");
      const data = (await res.json()) as { content?: string; filename?: string; error?: string };
      if (!res.ok || !data.content) {
        setImportMessage(data.error ?? "No players.csv found in Backup folder.");
        return;
      }

      const result = parsePlayerCsv(data.content);
      if (!result) {
        setImportMessage("No valid player rows found in Backup/players.csv.");
        return;
      }

      setImportPreview(result.parsed);
      setImportIsFullBackup(result.isFullBackup);
      setImportFileName("Backup/players.csv");
    } catch {
      setImportMessage("Failed to read from Backup folder.");
    }
  };

  const handleImportConfirm = async () => {
    if (!season || !importPreview) return;

    try {
      const res = await fetch("/api/players/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: season.id, players: importPreview, isFullBackup: importIsFullBackup }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        setImportMessage(`Import failed: ${err.error}`);
      } else {
        const data = (await res.json()) as { added: number; updated: number; skipped: number };
        const parts: string[] = [];
        if (data.added > 0) parts.push(`${data.added} added`);
        if (data.updated > 0) parts.push(`${data.updated} updated`);
        if (data.skipped > 0) parts.push(`${data.skipped} unchanged`);
        setImportMessage(`Import complete: ${parts.join(", ")}.`);
        await new Promise((r) => setTimeout(r, 100));
        await loadPlayers(season.id);
      }
    } catch {
      setImportMessage("Import failed. Please try again.");
    }

    setImportPreview(null);
    setImportIsFullBackup(false);
    setImportFileName("");
  };

  const handleImportCancel = () => {
    setImportPreview(null);
    setImportIsFullBackup(false);
    setImportFileName("");
  };

  const handleExportCsv = async () => {
    const FULL_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Helper to escape CSV fields containing commas or quotes
    const esc = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const header = "Last Name,First Name,Cell,Home,Email,Skill,Frequency,Solo Games,,Active,Derated,No Consecutive Days,No Early Games,Blocked Days,Vacations,Does Not Play With";
    const rows = sortedPlayers.map((p) => {
      const blockedDays = p.blockedDays.map((d) => FULL_DAYS[d]).join("; ") || "";
      const vacations = p.vacations.map((v) => `${v.startDate} to ${v.endDate}`).join("; ") || "";
      const doNotPair = (p.doNotPair ?? [])
        .map((id) => {
          const match = players.find((pl) => pl.id === id);
          return match ? `${match.lastName}, ${match.firstName}` : "";
        })
        .filter(Boolean)
        .join("; ") || "";
      const freq = p.contractedFrequency === "0" ? "Sub" : p.contractedFrequency;
      const soloGames = p.soloGames ? String(p.soloGames) : "";

      return [
        esc(p.lastName),
        esc(p.firstName),
        esc(formatPhone(p.cellNumber)),
        esc(formatPhone(p.homeNumber)),
        esc(p.email ?? ""),
        p.skillLevel,
        freq,
        soloGames,
        "", // placeholder for removed Solo Pair column (maintains column positions)
        p.isActive ? "Yes" : "No",
        p.isDerated ? "Yes" : "No",
        p.noConsecutiveDays ? "Yes" : "No",
        p.noEarlyGames ? "Yes" : "No",
        esc(blockedDays),
        esc(vacations),
        esc(doNotPair),
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");

    // Save to Backup/ directory on server
    setExportMessage("");
    try {
      const res = await fetch("/api/export-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "players.csv", content: csv }),
      });
      const data = (await res.json()) as { success?: boolean; filename?: string; error?: string };
      if (res.ok && data.success) {
        setExportMessage(`Players CSV saved to Backup/${data.filename}`);
      } else {
        setExportMessage(`Export failed: ${data.error ?? "Unknown error"}`);
      }
    } catch (err) {
      setExportMessage(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const SortHeader = ({
    field,
    label,
  }: {
    field: typeof sortField;
    label: string;
  }) => (
    <th
      className="text-left px-2 py-1 border-b border-border cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => handleSort(field)}
    >
      {label} {sortField === field ? (sortAsc ? "^" : "v") : ""}
    </th>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Players</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={`border border-border px-4 py-2 rounded text-sm transition-colors ${
              showInactive ? "bg-gray-200 font-medium" : "hover:bg-gray-100"
            }`}
          >
            {showInactive ? "Hide Inactive" : "Show Inactive"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvFileSelected}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
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
          {players.length > 0 && (
            <button
              onClick={handleExportCsv}
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
            >
              Export CSV
            </button>
          )}
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            disabled={editingId !== null}
            className={`px-4 py-2 rounded text-sm transition-colors ${
              editingId !== null
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-primary text-white hover:bg-primary-hover"
            }`}
          >
            Add Player
          </button>
        </div>
      </div>

      {importMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded px-4 py-2 mb-4 text-sm">
          {importMessage}
        </div>
      )}

      {exportMessage && (
        <div className={`border rounded px-4 py-2 mb-4 text-sm ${exportMessage.startsWith("Export failed") ? "bg-red-50 border-red-200 text-red-800" : "bg-green-50 border-green-200 text-green-800"}`}>
          {exportMessage}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="border border-border rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">
            {editingId ? "Edit Player" : "New Player"}
          </h2>
          {formError && (
            <div className="text-danger text-sm mb-3">{formError}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm text-muted mb-1">First Name *</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="border border-border rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Last Name *</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="border border-border rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="border border-border rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Cell</label>
              <input
                type="text"
                value={form.cellNumber}
                onChange={(e) => setForm({ ...form, cellNumber: e.target.value })}
                className="border border-border rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Home</label>
              <input
                type="text"
                value={form.homeNumber}
                onChange={(e) => setForm({ ...form, homeNumber: e.target.value })}
                className="border border-border rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Frequency</label>
              <select
                value={form.contractedFrequency}
                onChange={(e) => setForm({ ...form, contractedFrequency: e.target.value })}
                className="border border-border rounded px-3 py-2 text-sm w-full"
              >
                <option value="0">Sub</option>
                <option value="1">1x/week</option>
                <option value="2">2x/week</option>
                <option value="2+">2+/week</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Skill Level</label>
              <select
                value={form.skillLevel}
                onChange={(e) => setForm({ ...form, skillLevel: e.target.value })}
                className="border border-border rounded px-3 py-2 text-sm w-full"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Solo Games</label>
              <div className="flex gap-2">
                <select
                  value={form.soloGames === 36 ? "36" : form.soloGames === 18 ? "18" : form.soloGames ? "custom" : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") setForm({ ...form, soloGames: null });
                    else if (v === "custom") setForm({ ...form, soloGames: form.soloGames || 1 });
                    else setForm({ ...form, soloGames: parseInt(v) });
                  }}
                  className="border border-border rounded px-3 py-2 text-sm flex-1"
                >
                  <option value="">None</option>
                  <option value="36">Full (36)</option>
                  <option value="18">Half (18)</option>
                  <option value="custom">Custom...</option>
                </select>
                {form.soloGames !== null && (
                  <input
                    type="number"
                    min={1}
                    max={36}
                    value={form.soloGames}
                    onChange={(e) => {
                      const n = parseInt(e.target.value);
                      if (!isNaN(n) && n >= 1 && n <= 36) setForm({ ...form, soloGames: n });
                      else if (e.target.value === "") setForm({ ...form, soloGames: null });
                    }}
                    className="border border-border rounded px-3 py-2 text-sm w-20"
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.noConsecutiveDays}
                  onChange={(e) => setForm({ ...form, noConsecutiveDays: e.target.checked })}
                />
                No consecutive days
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isDerated}
                  onChange={(e) => setForm({ ...form, isDerated: e.target.checked })}
                />
                Derated
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.noEarlyGames}
                  onChange={(e) => setForm({ ...form, noEarlyGames: e.target.checked })}
                />
                No early games
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.cGamesOk}
                  onChange={(e) => setForm({ ...form, cGamesOk: e.target.checked })}
                />
                C games OK
              </label>
            </div>
          </div>

          {/* Blocked Days */}
          <div className="mb-4">
            <label className="block text-sm text-muted mb-2">Blocked Days</label>
            <div className="flex gap-3">
              {DAYS.map((day, i) => (
                <label key={i} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={form.blockedDays.includes(i)}
                    onChange={() => toggleBlockedDay(i)}
                  />
                  {day}
                </label>
              ))}
            </div>
          </div>

          {/* Vacations */}
          <div className="mb-4">
            <label className="block text-sm text-muted mb-2">Vacation Dates</label>
            {form.vacations.map((v, idx) => (
              <div key={idx} className="flex gap-3 items-center mb-2">
                <div>
                  <label className="block text-xs text-muted">Start</label>
                  <input
                    type="date"
                    value={v.startDate}
                    onChange={(e) => {
                      const updated = [...form.vacations];
                      updated[idx] = { ...updated[idx], startDate: e.target.value };
                      setForm({ ...form, vacations: updated });
                    }}
                    className="border border-border rounded px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Last Day</label>
                  <input
                    type="date"
                    value={v.endDate}
                    min={v.startDate || undefined}
                    onChange={(e) => {
                      const updated = [...form.vacations];
                      updated[idx] = { ...updated[idx], endDate: e.target.value };
                      setForm({ ...form, vacations: updated });
                    }}
                    className="border border-border rounded px-3 py-1.5 text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    setForm({
                      ...form,
                      vacations: form.vacations.filter((_, i) => i !== idx),
                    });
                  }}
                  className="text-danger text-xs hover:underline mt-4"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setForm({
                  ...form,
                  vacations: [...form.vacations, { startDate: "", endDate: "" }],
                })
              }
              className="text-primary text-sm hover:underline"
            >
              + Add vacation range
            </button>
          </div>

          {/* Does Not Play With */}
          <div className="mb-4">
            <label className="block text-sm text-muted mb-2">Does Not Play With</label>
            {form.doNotPair.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {form.doNotPair.map((id) => {
                  const p = players.find((pl) => pl.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-800 rounded px-2 py-0.5 text-xs"
                    >
                      {p ? `${p.lastName}, ${p.firstName}` : `Player #${id}`}
                      <button
                        onClick={() =>
                          setForm({
                            ...form,
                            doNotPair: form.doNotPair.filter((pid) => pid !== id),
                          })
                        }
                        className="text-red-500 hover:text-red-700 font-bold ml-1"
                      >
                        x
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <select
              value=""
              onChange={(e) => {
                const selectedId = parseInt(e.target.value);
                if (selectedId && !form.doNotPair.includes(selectedId)) {
                  setForm({
                    ...form,
                    doNotPair: [...form.doNotPair, selectedId],
                  });
                }
              }}
              className="border border-border rounded px-3 py-1.5 text-sm w-64"
            >
              <option value="">+ Add player...</option>
              {players
                .filter(
                  (p) =>
                    p.id !== editingId &&
                    !form.doNotPair.includes(p.id) &&
                    p.isActive
                )
                .sort((a, b) => a.lastName.localeCompare(b.lastName))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary-hover transition-colors"
            >
              {editingId ? "Update Player" : "Add Player"}
            </button>
            <button
              onClick={resetForm}
              className="text-sm text-muted hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Player Table */}
      {sortedPlayers.length === 0 ? (
        <p className="text-muted text-sm">No players added yet.</p>
      ) : (
        <table className="w-full text-sm border border-border">
          <thead>
            <tr className="bg-gray-50">
              <SortHeader field="lastName" label="Last Name" />
              <SortHeader field="firstName" label="First Name" />
              <th className="text-left px-2 py-1 border-b border-border">Cell</th>
              <th className="text-left px-2 py-1 border-b border-border">Home</th>
              <th className="text-left px-2 py-1 border-b border-border">Email</th>
              <SortHeader field="skillLevel" label="Skill" />
              <SortHeader field="contractedFrequency" label="Freq" />
              <th className="text-left px-2 py-1 border-b border-border">Solo</th>
              <th className="text-left px-2 py-1 border-b border-border">Active</th>
              <th className="text-left px-2 py-1 border-b border-border">Drtd</th>
              <th className="text-left px-2 py-1 border-b border-border">Blocked Days</th>
              <th className="text-left px-2 py-1 border-b border-border">Vacations</th>
              <th className="text-left px-2 py-1 border-b border-border">Does Not Play With</th>
              <th className="text-left px-2 py-1 border-b border-border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player, idx) => (
              <tr
                key={player.id}
                className={`border-b border-border ${idx % 2 === 1 ? "bg-[#fdf8f0]" : "bg-white"} ${!player.isActive ? "opacity-50" : ""}`}
              >
                <td className="px-2 py-1 font-medium">
                  <button
                    onClick={() => handleEdit(player)}
                    className="text-left hover:underline hover:text-primary cursor-pointer"
                  >
                    {player.lastName}
                  </button>
                </td>
                <td className="px-2 py-1">{player.firstName}</td>
                <td className="px-2 py-1">{formatPhone(player.cellNumber)}</td>
                <td className="px-2 py-1">{formatPhone(player.homeNumber)}</td>
                <td className="px-2 py-1">{player.email}</td>
                <td className="px-2 py-1">{player.skillLevel}</td>
                <td className="px-2 py-1">{player.contractedFrequency === "0" ? "Sub" : player.contractedFrequency}</td>
                <td className="px-2 py-1">
                  {player.soloGames
                    ? <span className="text-orange-600">{player.soloGames}</span>
                    : "-"}
                </td>
                <td className="px-2 py-1">{player.isActive ? "Yes" : "No"}</td>
                <td className="px-2 py-1">{player.isDerated ? "✓" : "-"}</td>
                <td className="px-2 py-1">
                  {player.blockedDays.map((d) => DAYS[d]).join(", ") || "-"}
                </td>
                <td className="px-2 py-1 text-xs">
                  {player.vacations.length > 0
                    ? player.vacations.map((v) => `${v.startDate} → ${v.endDate}`).join(", ")
                    : "-"}
                </td>
                <td className="px-2 py-1 text-xs text-red-700">
                  {player.doNotPair && player.doNotPair.length > 0
                    ? player.doNotPair
                        .map((id) => {
                          const p = players.find((pl) => pl.id === id);
                          return p ? p.lastName : `#${id}`;
                        })
                        .join(", ")
                    : "-"}
                </td>
                <td className="px-2 py-1 flex gap-3">
                  <button
                    onClick={() => handleEdit(player)}
                    className="text-primary hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(player.id)}
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
      <p className="text-xs text-muted mt-3">
        {players.filter((p) => p.isActive).length} active
        {showInactive ? ` / ${players.filter((p) => !p.isActive).length} inactive` : ""}{" "}
        / {players.length} total players
      </p>

      {/* Import confirmation modal */}
      {importPreview && (() => {
        const newCount = importPreview.filter(
          (p) => !players.some((ex) => ex.firstName === p.firstName && ex.lastName === p.lastName)
        ).length;
        const updateCount = importPreview.length - newCount;

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <h3 className="font-semibold text-lg mb-3">Import Players</h3>
              <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm mb-4">
                <span className="font-semibold">{importPreview.length}</span> player
                {importPreview.length !== 1 ? "s" : ""} found in{" "}
                <span className="font-semibold">{importFileName}</span>:
                {newCount > 0 && (
                  <span className="text-green-700 font-medium"> {newCount} new</span>
                )}
                {newCount > 0 && updateCount > 0 && ","}
                {updateCount > 0 && (
                  <span className="text-blue-700 font-medium"> {updateCount} existing (will update)</span>
                )}
                .
                {importIsFullBackup && (
                  <span className="block mt-1 text-amber-700 font-medium">
                    Full backup detected — skill, frequency, solo, blocked days, vacations, and pairings will be restored.
                  </span>
                )}
              </div>
              <table className="w-full text-sm border border-border mb-4">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 border-b border-border">#</th>
                    <th className="text-left px-3 py-2 border-b border-border">Status</th>
                    <th className="text-left px-3 py-2 border-b border-border">Last Name</th>
                    <th className="text-left px-3 py-2 border-b border-border">First Name</th>
                    {importIsFullBackup ? (
                      <>
                        <th className="text-left px-3 py-2 border-b border-border">Skill</th>
                        <th className="text-left px-3 py-2 border-b border-border">Freq</th>
                        <th className="text-left px-3 py-2 border-b border-border">Solo</th>
                        <th className="text-left px-3 py-2 border-b border-border">Active</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left px-3 py-2 border-b border-border">Cell</th>
                        <th className="text-left px-3 py-2 border-b border-border">Email</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((p, i) => {
                    const isExisting = players.some(
                      (ex) => ex.firstName === p.firstName && ex.lastName === p.lastName
                    );
                    return (
                      <tr key={i} className={i % 2 ? "bg-gray-50/50" : ""}>
                        <td className="px-3 py-1.5 border-b border-border text-muted">{i + 1}</td>
                        <td className="px-3 py-1.5 border-b border-border">
                          {isExisting ? (
                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Update</span>
                          ) : (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">New</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 border-b border-border font-medium">{p.lastName}</td>
                        <td className="px-3 py-1.5 border-b border-border">{p.firstName}</td>
                        {importIsFullBackup ? (
                          <>
                            <td className="px-3 py-1.5 border-b border-border">{p.skillLevel ?? ""}</td>
                            <td className="px-3 py-1.5 border-b border-border">{p.contractedFrequency === "0" ? "Sub" : (p.contractedFrequency ?? "")}</td>
                            <td className="px-3 py-1.5 border-b border-border">{p.soloGames ?? ""}</td>
                            <td className="px-3 py-1.5 border-b border-border">{p.isActive === false ? "No" : "Yes"}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-1.5 border-b border-border">{formatPhone(p.cellNumber)}</td>
                            <td className="px-3 py-1.5 border-b border-border">{p.email ?? ""}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
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
                  Import {importPreview.length} Player{importPreview.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
