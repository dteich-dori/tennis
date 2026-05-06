import path from "path";
import { db } from "@/db/getDb";
import { appSettings } from "@/db/schema";

const DEFAULT_BACKUP_DIR = "Backup";

function resolve(dir: string | undefined | null): string | null {
  const trimmed = (dir ?? "").trim();
  if (!trimmed) return null;
  return path.isAbsolute(trimmed) ? trimmed : path.join(process.cwd(), trimmed);
}

/**
 * Backwards-compatible single-path lookup. Returns the resolved primary
 * backup directory only.
 */
export async function getBackupDir(): Promise<string> {
  try {
    const d = await db();
    const rows = await d.select().from(appSettings);
    const primary = rows.length > 0 ? rows[0].backupDir : DEFAULT_BACKUP_DIR;
    return resolve(primary) ?? path.join(process.cwd(), DEFAULT_BACKUP_DIR);
  } catch {
    return path.join(process.cwd(), DEFAULT_BACKUP_DIR);
  }
}

/**
 * Returns ALL configured backup destinations (primary, optionally secondary).
 * Each entry has the raw stored value and the resolved absolute path.
 */
export interface BackupDirEntry {
  raw: string;
  resolved: string;
}

export async function getBackupDirs(): Promise<BackupDirEntry[]> {
  try {
    const d = await db();
    const rows = await d.select().from(appSettings);
    if (rows.length === 0) {
      return [
        { raw: DEFAULT_BACKUP_DIR, resolved: path.join(process.cwd(), DEFAULT_BACKUP_DIR) },
      ];
    }
    const row = rows[0];
    const out: BackupDirEntry[] = [];
    const primary = resolve(row.backupDir);
    if (primary) out.push({ raw: row.backupDir, resolved: primary });
    // backupDir2 may not exist yet on older deployments before the migration
    const secondary = resolve(
      (row as { backupDir2?: string | null }).backupDir2 ?? null
    );
    if (secondary) {
      out.push({
        raw: (row as { backupDir2?: string | null }).backupDir2 ?? "",
        resolved: secondary,
      });
    }
    return out;
  } catch {
    return [
      { raw: DEFAULT_BACKUP_DIR, resolved: path.join(process.cwd(), DEFAULT_BACKUP_DIR) },
    ];
  }
}
