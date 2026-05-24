/**
 * Dropbox uploader for the backup bundle.
 *
 * Auth uses the long-lived refresh-token flow:
 *   DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET
 * are exchanged for a short-lived access token on every backup. The token
 * isn't cached across invocations because Vercel functions are stateless;
 * the exchange adds ~100ms which is irrelevant for a backup.
 *
 * Path convention:
 *   /teich/tennis/{seasonLabel}/scheduler/backup/{folderName}/{file}
 * where seasonLabel is auto-derived from the season's start year, e.g.
 * a season starting Sep 2026 → "2026-27".
 *
 * Rule of 3: after a successful upload, the oldest sibling folders inside
 * the season's backup directory are pruned to keep at most 3 newest.
 */

import type { BackupBundle } from "./buildBackup";

const DROPBOX_OAUTH_URL = "https://api.dropbox.com/oauth2/token";
const DROPBOX_UPLOAD_URL = "https://content.dropboxapi.com/2/files/upload";
const DROPBOX_LIST_URL = "https://api.dropboxapi.com/2/files/list_folder";
const DROPBOX_DELETE_URL = "https://api.dropboxapi.com/2/files/delete_v2";

export interface DropboxUploadResult {
  basePath: string;
  folderName: string;
  uploadedFiles: number;
  prunedFolders: string[];
  totalFoldersAfter: number;
}

export function dropboxConfigured(): boolean {
  return Boolean(
    process.env.DROPBOX_REFRESH_TOKEN &&
      process.env.DROPBOX_APP_KEY &&
      process.env.DROPBOX_APP_SECRET
  );
}

/** Derive the "2026-27" season label from a YYYY-MM-DD startDate. */
export function seasonLabelFromStartDate(startDate: string): string {
  const m = /^(\d{4})-/.exec(startDate);
  if (!m) return "unknown-season";
  const startYear = parseInt(m[1], 10);
  const nextYy = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${nextYy}`;
}

async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: process.env.DROPBOX_REFRESH_TOKEN!,
    client_id: process.env.DROPBOX_APP_KEY!,
    client_secret: process.env.DROPBOX_APP_SECRET!,
  });
  const res = await fetch(DROPBOX_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dropbox token refresh failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Dropbox token refresh: no access_token in response");
  }
  return data.access_token;
}

interface FileEntry {
  name: string;
  contents: string | Uint8Array;
}

function bundleToFiles(bundle: BackupBundle): FileEntry[] {
  const files: FileEntry[] = [];
  files.push({
    name: "manifest.json",
    contents: JSON.stringify(bundle.manifest, null, 2),
  });
  files.push({
    name: "data.json",
    contents: JSON.stringify(bundle.dataJson, null, 2),
  });
  files.push({ name: "RESTORE.md", contents: bundle.restoreMd });
  files.push({ name: ".env.template", contents: bundle.envTemplate });
  for (const [table, csv] of Object.entries(bundle.csvFiles)) {
    files.push({ name: `${table}.csv`, contents: csv });
  }
  return files;
}

async function uploadOne(
  accessToken: string,
  path: string,
  contents: string | Uint8Array
): Promise<void> {
  const buf =
    typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
  const res = await fetch(DROPBOX_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path,
        mode: "overwrite",
        autorename: false,
        mute: true,
        strict_conflict: false,
      }),
    },
    body: buf as unknown as BodyInit,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dropbox upload failed for ${path}: ${res.status} ${text}`);
  }
}

interface ListFolderEntry {
  ".tag": string;
  name: string;
  path_display?: string;
  server_modified?: string;
}

async function listFolders(
  accessToken: string,
  basePath: string
): Promise<ListFolderEntry[]> {
  const res = await fetch(DROPBOX_LIST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: basePath, recursive: false }),
  });
  if (res.status === 409) {
    // path_not_found is fine — folder doesn't exist yet
    return [];
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dropbox list_folder failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { entries: ListFolderEntry[] };
  return data.entries.filter((e) => e[".tag"] === "folder");
}

async function deletePath(accessToken: string, path: string): Promise<void> {
  const res = await fetch(DROPBOX_DELETE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dropbox delete failed for ${path}: ${res.status} ${text}`);
  }
}

/**
 * Upload the bundle to Dropbox and prune older sibling backups so only the
 * KEEP most recent (default 3) remain.
 */
export async function uploadBundleToDropbox(
  bundle: BackupBundle,
  opts?: { keep?: number; rootPath?: string }
): Promise<DropboxUploadResult> {
  const keep = opts?.keep ?? 3;
  const rootPath = (opts?.rootPath ?? "/teich/tennis").replace(/\/+$/, "");

  const startDate = bundle.manifest.seasons[0]?.startDate ?? "";
  const seasonLabel = seasonLabelFromStartDate(startDate);
  const basePath = `${rootPath}/${seasonLabel}/scheduler/backup`;
  const folderPath = `${basePath}/${bundle.folderName}`;

  const accessToken = await getAccessToken();

  // Upload every file in the bundle. Dropbox auto-creates parent folders.
  const files = bundleToFiles(bundle);
  for (const f of files) {
    await uploadOne(accessToken, `${folderPath}/${f.name}`, f.contents);
  }

  // Prune. List sibling folders, sort by name desc (folder names embed
  // timestamps so lexical sort == chronological), drop the oldest beyond KEEP.
  let prunedFolders: string[] = [];
  let totalAfter = 0;
  try {
    const folders = await listFolders(accessToken, basePath);
    folders.sort((a, b) => b.name.localeCompare(a.name));
    totalAfter = folders.length;
    if (folders.length > keep) {
      const oldest = folders.slice(keep);
      for (const f of oldest) {
        try {
          await deletePath(accessToken, `${basePath}/${f.name}`);
          prunedFolders.push(f.name);
        } catch (delErr) {
          console.error(`[dropboxBackup] failed to prune ${f.name}:`, delErr);
        }
      }
      totalAfter = folders.length - prunedFolders.length;
    }
  } catch (listErr) {
    // Prune failure is non-fatal — the upload itself succeeded
    console.error("[dropboxBackup] prune step failed:", listErr);
  }

  return {
    basePath,
    folderName: bundle.folderName,
    uploadedFiles: files.length,
    prunedFolders,
    totalFoldersAfter: totalAfter,
  };
}
