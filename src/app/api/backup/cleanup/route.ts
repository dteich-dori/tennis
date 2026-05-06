import { NextRequest, NextResponse } from "next/server";
import { getBackupDirs } from "@/lib/getBackupDir";
import path from "path";
import fs from "fs";

const BACKUP_FOLDER_PREFIX = "Tennis-Scheduler-V";

interface CleanupBody {
  /**
   * Either:
   *   - { baseDir: string, folders: string[] }                      (single dir)
   *   - { directories: [{ baseDir, folders }] }                     (multi)
   *
   * The legacy { folders: [...] } form (no baseDir) is also accepted and
   * targets the primary configured directory.
   */
  baseDir?: string;
  folders?: string[];
  directories?: Array<{ baseDir: string; folders: string[] }>;
}

interface PerDirResult {
  baseDir: string;
  deleted: string[];
  skipped: { folder: string; reason: string }[];
  remaining: number;
}

/**
 * POST /api/backup/cleanup
 * Deletes named backup folders. Each name must:
 *   - start with "Tennis-Scheduler-V"
 *   - resolve to a path inside one of the configured backup directories
 *   - be a directory (we won't delete files this way)
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CleanupBody;

    // Normalize input into a list of { baseDir, folders } work items.
    let workItems: Array<{ baseDir: string; folders: string[] }> = [];
    if (Array.isArray(body.directories) && body.directories.length > 0) {
      workItems = body.directories.filter(
        (d) => Array.isArray(d.folders) && d.folders.length > 0
      );
    } else if (Array.isArray(body.folders) && body.folders.length > 0) {
      // Legacy / single-dir form
      const allowedDirs = await getBackupDirs();
      const baseDir =
        body.baseDir ?? (allowedDirs[0]?.resolved ?? "");
      if (!baseDir) {
        return NextResponse.json(
          { error: "No baseDir provided and no configured backup directory" },
          { status: 400 }
        );
      }
      workItems = [{ baseDir, folders: body.folders }];
    }

    if (workItems.length === 0) {
      return NextResponse.json({ error: "folders required" }, { status: 400 });
    }

    // Whitelist: only allow deletion inside the currently configured backup dirs
    const allowedDirs = await getBackupDirs();
    const allowedAbs = new Set(allowedDirs.map((d) => path.resolve(d.resolved)));

    const results: PerDirResult[] = [];

    for (const item of workItems) {
      const baseDirAbs = path.resolve(item.baseDir);
      if (!allowedAbs.has(baseDirAbs)) {
        results.push({
          baseDir: baseDirAbs,
          deleted: [],
          skipped: item.folders.map((f) => ({
            folder: f,
            reason: "baseDir is not a configured backup directory",
          })),
          remaining: 0,
        });
        continue;
      }

      const deleted: string[] = [];
      const skipped: { folder: string; reason: string }[] = [];

      for (const name of item.folders) {
        if (!name.startsWith(BACKUP_FOLDER_PREFIX)) {
          skipped.push({ folder: name, reason: "Not a backup folder name" });
          continue;
        }
        if (name.includes("/") || name.includes("\\") || name.includes("..")) {
          skipped.push({ folder: name, reason: "Invalid folder name" });
          continue;
        }
        const target = path.join(baseDirAbs, name);
        const targetAbs = path.resolve(target);
        if (
          !targetAbs.startsWith(baseDirAbs + path.sep) &&
          targetAbs !== baseDirAbs
        ) {
          skipped.push({ folder: name, reason: "Outside backup dir" });
          continue;
        }
        if (!fs.existsSync(targetAbs)) {
          skipped.push({ folder: name, reason: "Not found" });
          continue;
        }
        const stat = fs.statSync(targetAbs);
        if (!stat.isDirectory()) {
          skipped.push({ folder: name, reason: "Not a directory" });
          continue;
        }
        try {
          fs.rmSync(targetAbs, { recursive: true, force: true });
          deleted.push(name);
        } catch (err) {
          skipped.push({ folder: name, reason: String(err) });
        }
      }

      // Count remaining backup folders in this dir
      let remaining = 0;
      if (fs.existsSync(baseDirAbs)) {
        const entries = fs.readdirSync(baseDirAbs, { withFileTypes: true });
        remaining = entries.filter(
          (e) => e.isDirectory() && e.name.startsWith(BACKUP_FOLDER_PREFIX)
        ).length;
      }

      results.push({ baseDir: baseDirAbs, deleted, skipped, remaining });
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[backup/cleanup POST] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
