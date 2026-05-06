import { NextRequest, NextResponse } from "next/server";
import { getBackupDir } from "@/lib/getBackupDir";
import path from "path";
import fs from "fs";

const BACKUP_FOLDER_PREFIX = "Tennis-Scheduler-V";

interface CleanupBody {
  folders: string[];
}

/**
 * POST /api/backup/cleanup
 * Body: { folders: string[] }
 * Deletes the named backup folders. Each name must:
 *   - start with "Tennis-Scheduler-V"
 *   - resolve to a path inside the configured backup directory (no traversal)
 *   - be a directory (we won't delete files this way)
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CleanupBody;
    const folders = Array.isArray(body.folders) ? body.folders : [];
    if (folders.length === 0) {
      return NextResponse.json({ error: "folders required" }, { status: 400 });
    }

    const baseDir = await getBackupDir();
    const baseDirAbs = path.resolve(baseDir);

    const deleted: string[] = [];
    const skipped: { folder: string; reason: string }[] = [];

    for (const name of folders) {
      // Pattern check
      if (!name.startsWith(BACKUP_FOLDER_PREFIX)) {
        skipped.push({ folder: name, reason: "Not a backup folder name" });
        continue;
      }
      // No traversal characters
      if (name.includes("/") || name.includes("\\") || name.includes("..")) {
        skipped.push({ folder: name, reason: "Invalid folder name" });
        continue;
      }
      const target = path.join(baseDirAbs, name);
      const targetAbs = path.resolve(target);
      // Confirm target is inside baseDir
      if (
        !targetAbs.startsWith(baseDirAbs + path.sep) &&
        targetAbs !== baseDirAbs
      ) {
        skipped.push({ folder: name, reason: "Outside backup dir" });
        continue;
      }
      // Must exist and be a directory
      if (!fs.existsSync(targetAbs)) {
        skipped.push({ folder: name, reason: "Not found" });
        continue;
      }
      const stat = fs.statSync(targetAbs);
      if (!stat.isDirectory()) {
        skipped.push({ folder: name, reason: "Not a directory" });
        continue;
      }
      // Delete
      try {
        fs.rmSync(targetAbs, { recursive: true, force: true });
        deleted.push(name);
      } catch (err) {
        skipped.push({ folder: name, reason: String(err) });
      }
    }

    // Count remaining
    let remaining = 0;
    if (fs.existsSync(baseDirAbs)) {
      const entries = fs.readdirSync(baseDirAbs, { withFileTypes: true });
      remaining = entries.filter(
        (e) => e.isDirectory() && e.name.startsWith(BACKUP_FOLDER_PREFIX)
      ).length;
    }

    return NextResponse.json({ success: true, deleted, skipped, remaining });
  } catch (err) {
    console.error("[backup/cleanup POST] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
