import { NextResponse } from "next/server";
import { getBackupDir } from "@/lib/getBackupDir";
import path from "path";
import fs from "fs";

export async function GET() {
  try {
    const backupDir = await getBackupDir();
    if (!fs.existsSync(backupDir)) {
      return NextResponse.json({ files: [] });
    }

    const entries = fs.readdirSync(backupDir, { withFileTypes: true });

    // Top-level CSV files
    const topFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".csv"))
      .map((e) => ({
        name: e.name,
        path: e.name,
        modified: fs.statSync(path.join(backupDir, e.name)).mtime.toISOString(),
      }));

    // CSV files inside timestamped subdirectories
    const subFiles: { name: string; path: string; modified: string; folder: string }[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip non-backup directories
      if (entry.name.startsWith(".")) continue;
      const subDir = path.join(backupDir, entry.name);
      const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isFile() && sub.name.endsWith(".csv")) {
          subFiles.push({
            name: sub.name,
            path: `${entry.name}/${sub.name}`,
            modified: fs.statSync(path.join(subDir, sub.name)).mtime.toISOString(),
            folder: entry.name,
          });
        }
      }
    }

    return NextResponse.json({ files: topFiles, subfolders: subFiles });
  } catch (err) {
    console.error("[backup/list GET] error:", err);
    return NextResponse.json({ error: "Failed to list backup files" }, { status: 500 });
  }
}
