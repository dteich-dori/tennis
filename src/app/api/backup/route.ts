import { NextResponse } from "next/server";
import { buildBackup } from "@/lib/buildBackup";
import { getBackupDirs } from "@/lib/getBackupDir";
import path from "path";
import fs from "fs";
import JSZip from "jszip";

const BACKUP_FOLDER_PREFIX = "Tennis-Scheduler-V";

function listBackupFolders(baseDir: string): { name: string; mtimeMs: number }[] {
  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const folders: { name: string; mtimeMs: number }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (!e.name.startsWith(BACKUP_FOLDER_PREFIX)) continue;
    const stat = fs.statSync(path.join(baseDir, e.name));
    folders.push({ name: e.name, mtimeMs: stat.mtimeMs });
  }
  return folders;
}

function uniqueFolderName(baseDir: string, desired: string): string {
  if (!fs.existsSync(path.join(baseDir, desired))) return desired;
  let i = 2;
  while (fs.existsSync(path.join(baseDir, `${desired}-${i}`))) i++;
  return `${desired}-${i}`;
}

function writeBackupToFs(
  baseDir: string,
  folderName: string,
  bundle: Awaited<ReturnType<typeof buildBackup>>
) {
  const target = path.join(baseDir, folderName);
  const csvDir = path.join(target, "csv");
  fs.mkdirSync(csvDir, { recursive: true });
  fs.writeFileSync(
    path.join(target, "manifest.json"),
    JSON.stringify(bundle.manifest, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(target, "data.json"),
    JSON.stringify(bundle.dataJson, null, 2),
    "utf-8"
  );
  fs.writeFileSync(path.join(target, "RESTORE.md"), bundle.restoreMd, "utf-8");
  fs.writeFileSync(
    path.join(target, "env.template"),
    bundle.envTemplate,
    "utf-8"
  );
  for (const [name, csv] of Object.entries(bundle.csvFiles)) {
    if (csv) {
      fs.writeFileSync(path.join(csvDir, `${name}.csv`), csv, "utf-8");
    }
  }
  return target;
}

async function buildZip(bundle: Awaited<ReturnType<typeof buildBackup>>): Promise<Uint8Array> {
  const zip = new JSZip();
  const root = zip.folder(bundle.folderName)!;
  root.file("manifest.json", JSON.stringify(bundle.manifest, null, 2));
  root.file("data.json", JSON.stringify(bundle.dataJson, null, 2));
  root.file("RESTORE.md", bundle.restoreMd);
  root.file("env.template", bundle.envTemplate);
  const csvFolder = root.folder("csv")!;
  for (const [name, csv] of Object.entries(bundle.csvFiles)) {
    if (csv) csvFolder.file(`${name}.csv`, csv);
  }
  return await zip.generateAsync({ type: "uint8array" });
}

interface DirResult {
  baseDir: string;
  folder: string;
  fullPath: string;
  totalBackups: number;
  oldestFolders: string[];
}

interface DirError {
  baseDir: string;
  error: string;
}

/**
 * POST /api/backup
 * Writes a complete backup to every configured destination (primary,
 * optionally secondary). If ALL destinations fail (e.g. Vercel read-only
 * filesystem), returns a single ZIP download as fallback.
 *
 * Filesystem response shape:
 *   {
 *     success: true,
 *     mode: "filesystem",
 *     directories: [{ baseDir, folder, fullPath, totalBackups, oldestFolders }],
 *     errors: [{ baseDir, error }],
 *     rowCounts
 *   }
 *
 * ZIP response: application/zip with attachment filename
 */
export async function POST() {
  try {
    const bundle = await buildBackup();
    const targets = await getBackupDirs();

    const writes: DirResult[] = [];
    const errors: DirError[] = [];

    for (const t of targets) {
      try {
        if (!fs.existsSync(t.resolved)) {
          fs.mkdirSync(t.resolved, { recursive: true });
        }
        const folderName = uniqueFolderName(t.resolved, bundle.folderName);
        writeBackupToFs(t.resolved, folderName, bundle);

        const folders = listBackupFolders(t.resolved).sort(
          (a, b) => a.mtimeMs - b.mtimeMs
        );
        const totalBackups = folders.length;
        const KEEP = 3;
        const oldestFolders =
          totalBackups > KEEP
            ? folders.slice(0, totalBackups - KEEP).map((f) => f.name)
            : [];

        writes.push({
          baseDir: t.resolved,
          folder: folderName,
          fullPath: path.join(t.resolved, folderName),
          totalBackups,
          oldestFolders,
        });
      } catch (fsErr) {
        errors.push({ baseDir: t.resolved, error: String(fsErr) });
      }
    }

    // If at least one filesystem write succeeded, return JSON summary.
    if (writes.length > 0) {
      return NextResponse.json({
        success: true,
        mode: "filesystem",
        directories: writes,
        errors,
        rowCounts: bundle.manifest.rowCounts,
      });
    }

    // No filesystem writes succeeded — fall back to ZIP download.
    const zipBytes = await buildZip(bundle);
    return new NextResponse(zipBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${bundle.folderName}.zip"`,
        "X-Backup-Mode": "zip",
        "X-Backup-Folder": bundle.folderName,
      },
    });
  } catch (err) {
    console.error("[backup POST] error:", err);
    return NextResponse.json(
      { error: "Failed to create backup: " + String(err) },
      { status: 500 }
    );
  }
}
