"use client";

import { useCallback, useState } from "react";

interface BackupDirResult {
  baseDir: string;
  folder: string;
  fullPath: string;
  totalBackups: number;
  oldestFolders: string[];
}

interface BackupResult {
  mode: "filesystem" | "zip";
  folder: string;
  rowCounts?: Record<string, number>;
  directories?: BackupDirResult[];
  errors?: { baseDir: string; error: string }[];
}

type BeforeRunOutcome = { ok: true } | { ok: false; error: string };

interface UseBackupOptions {
  /**
   * Optional callback invoked before the backup runs. Used by the Season
   * Setup page to persist edited backup-directory paths before triggering
   * the actual backup. Return `{ ok: false, error }` to abort with an
   * error banner.
   */
  beforeRun?: () => Promise<BeforeRunOutcome>;
}

/**
 * Reusable React hook for the unified Run Full Backup workflow.
 * Handles the multi-directory filesystem write + ZIP fallback + per-directory
 * rotation prompts. Surfaces busy / message / error state for the caller to
 * render however it wants.
 *
 * Usage:
 *   const { runBackup, busy, message, isError } = useBackup();
 *   <button onClick={runBackup} disabled={busy}>Backup All</button>
 *   {message && <div>{message}</div>}
 */
export function useBackup(options: UseBackupOptions = {}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const dismiss = useCallback(() => {
    setMessage("");
    setIsError(false);
  }, []);

  const runBackup = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setIsError(false);

    if (options.beforeRun) {
      const outcome = await options.beforeRun();
      if (!outcome.ok) {
        setIsError(true);
        setMessage(outcome.error);
        setBusy(false);
        return;
      }
    }

    let result: BackupResult | null = null;
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const ctype = res.headers.get("Content-Type") || "";

      if (ctype.startsWith("application/zip")) {
        // ZIP-fallback path — production / read-only filesystem
        const blob = await res.blob();
        const folder =
          res.headers.get("X-Backup-Folder") || "Tennis-Scheduler-backup";
        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `${folder}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        result = { folder, mode: "zip" };
      } else {
        const data = (await res.json()) as {
          success?: boolean;
          mode?: string;
          directories?: BackupDirResult[];
          errors?: { baseDir: string; error: string }[];
          rowCounts?: Record<string, number>;
          error?: string;
        };
        if (
          !res.ok ||
          !data.success ||
          !data.directories ||
          data.directories.length === 0
        ) {
          setIsError(true);
          setMessage(`Backup failed: ${data.error ?? "no destination wrote successfully"}`);
          setBusy(false);
          return;
        }
        result = {
          mode: "filesystem",
          folder: data.directories[0].folder,
          directories: data.directories,
          errors: data.errors,
          rowCounts: data.rowCounts,
        };
      }
    } catch (err) {
      setIsError(true);
      setMessage(
        `Backup error: ${err instanceof Error ? err.message : String(err)}`
      );
      setBusy(false);
      return;
    }

    if (!result) {
      setIsError(true);
      setMessage("Backup failed.");
      setBusy(false);
      return;
    }

    if (result.mode === "zip") {
      setMessage(
        `✓ Backup downloaded as ${result.folder}.zip (check your browser's Downloads). To save backups directly to your home network or iCloud, run from your local dev server.`
      );
      setBusy(false);
      return;
    }

    // Filesystem mode — may have written to 1 or 2 directories
    const counts = result.rowCounts ?? {};
    const totalRows = Object.values(counts).reduce((s, n) => s + n, 0);
    const dirs = result.directories ?? [];

    const linePerDir = dirs.map((d) => `  • ${d.fullPath}`).join("\n");
    let summary =
      `✓ Backup saved (${totalRows} rows across ${Object.keys(counts).length} tables) to:\n` +
      linePerDir;

    if (result.errors && result.errors.length > 0) {
      summary +=
        "\n\nFailed locations:\n" +
        result.errors.map((e) => `  • ${e.baseDir}: ${e.error}`).join("\n");
    }

    // Rule of 3: each directory prompted SEPARATELY so the admin can keep
    // all backups in one location while pruning another.
    const dirsNeedingCleanup = dirs.filter(
      (d) => d.oldestFolders && d.oldestFolders.length > 0
    );

    if (dirsNeedingCleanup.length === 0) {
      setMessage(summary);
      setBusy(false);
      return;
    }

    const cleanupLines: string[] = [];
    for (const d of dirsNeedingCleanup) {
      const list = d.oldestFolders.map((f) => `  • ${f}`).join("\n");
      const ok = window.confirm(
        `Rule of 3 — backup directory:\n  ${d.baseDir}\n\n` +
          `It now has ${d.totalBackups} backups. Delete the ${d.oldestFolders.length} oldest to keep only the 3 most recent?\n\n${list}`
      );
      if (!ok) {
        cleanupLines.push(
          `  • ${d.baseDir}: kept all ${d.totalBackups} (skipped)`
        );
        continue;
      }
      try {
        const cleanRes = await fetch("/api/backup/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directories: [{ baseDir: d.baseDir, folders: d.oldestFolders }],
          }),
        });
        const cleanData = (await cleanRes.json()) as {
          success?: boolean;
          results?: Array<{
            baseDir: string;
            deleted: string[];
            remaining: number;
          }>;
          error?: string;
        };
        if (cleanRes.ok && cleanData.success && cleanData.results?.[0]) {
          const r = cleanData.results[0];
          cleanupLines.push(
            `  • ${d.baseDir}: deleted ${r.deleted.length}, ${r.remaining} remaining`
          );
        } else {
          cleanupLines.push(
            `  • ${d.baseDir}: cleanup failed (${cleanData.error ?? "unknown"})`
          );
        }
      } catch (err) {
        cleanupLines.push(
          `  • ${d.baseDir}: cleanup error (${err instanceof Error ? err.message : String(err)})`
        );
      }
    }

    setMessage(`${summary}\n\nCleanup:\n${cleanupLines.join("\n")}`);
    setBusy(false);
  }, [busy, options]);

  return { runBackup, busy, message, isError, dismiss };
}
