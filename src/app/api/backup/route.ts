import { NextResponse } from "next/server";
import { buildBackup } from "@/lib/buildBackup";
import { getBackupDir } from "@/lib/getBackupDir";
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
  bundle: ReturnType<typeof JSON.stringify> extends infer _ ? Awaited<ReturnType<typeof buildBackup>> : never
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
  const csvFolder = root.folder("csv")!;
  for (const [name, csv] of Object.entries(bundle.csvFiles)) {
    if (csv) csvFolder.file(`${name}.csv`, csv);
  }
  return await zip.generateAsync({ type: "uint8array" });
}

/**
 * POST /api/backup
 * Tries to write a complete backup to the configured filesystem path.
 * If filesystem is read-only (e.g. Vercel), returns a ZIP download instead.
 *
 * Filesystem response shape:
 *   { success, mode: "filesystem", folder, fullPath, baseDir, rowCounts, totalBackups, oldestFolders }
 *
 * ZIP response: application/zip with attachment filename
 */
export async function POST() {
  try {
    const bundle = await buildBackup();

    let baseDir: string;
    try {
      baseDir = await getBackupDir();
    } catch {
      baseDir = "";
    }

    // Try filesystem write first
    if (baseDir) {
      try {
        if (!fs.existsSync(baseDir)) {
          fs.mkdirSync(baseDir, { recursive: true });
        }
        const folderName = uniqueFolderName(baseDir, bundle.folderName);
        writeBackupToFs(baseDir, folderName, bundle);

        // Rotation: list backup folders, sorted oldest-first
        const folders = listBackupFolders(baseDir).sort(
          (a, b) => a.mtimeMs - b.mtimeMs
        );
        const totalBackups = folders.length;
        const KEEP = 3;
        const oldestFolders =
          totalBackups > KEEP
            ? folders.slice(0, totalBackups - KEEP).map((f) => f.name)
            : [];

        return NextResponse.json({
          success: true,
          mode: "filesystem",
          folder: folderName,
          fullPath: path.join(baseDir, folderName),
          baseDir,
          rowCounts: bundle.manifest.rowCounts,
          totalBackups,
          oldestFolders,
        });
      } catch (fsErr) {
        // Fall through to ZIP download
        console.warn(
          "[backup] filesystem write failed, falling back to ZIP:",
          fsErr
        );
      }
    }

    // Filesystem not available — return as ZIP download
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
