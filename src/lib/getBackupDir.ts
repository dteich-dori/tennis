import path from "path";
import { db } from "@/db/getDb";
import { appSettings } from "@/db/schema";

const DEFAULT_BACKUP_DIR = "Backup";

export async function getBackupDir(): Promise<string> {
  try {
    const d = await db();
    const rows = await d.select().from(appSettings);
    const dir =
      rows.length > 0 && rows[0].backupDir
        ? rows[0].backupDir
        : DEFAULT_BACKUP_DIR;

    // If the path is relative, resolve it against cwd
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  } catch {
    return path.join(process.cwd(), DEFAULT_BACKUP_DIR);
  }
}
