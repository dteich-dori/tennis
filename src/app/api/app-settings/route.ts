import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";

function resolveBackupDir(dir: string | undefined | null): string {
  const value = (dir && dir.trim()) || "Backup";
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

export async function GET() {
  try {
    const database = await db();
    const rows = await database.select().from(appSettings);

    const backupDir = rows.length === 0 ? "Backup" : rows[0].backupDir;
    const backupDirResolved = resolveBackupDir(backupDir);

    if (rows.length === 0) {
      return NextResponse.json({ backupDir, backupDirResolved });
    }
    return NextResponse.json({ ...rows[0], backupDirResolved });
  } catch (err) {
    console.error("[app-settings GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load app settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { backupDir: string };
    const raw = body.backupDir ?? "";
    // Always trim — guards against leading/trailing whitespace that would
    // confuse path.isAbsolute() and cause the path to be re-rooted in /var/task
    // on Vercel.
    const backupDir = raw.trim();

    if (backupDir === "") {
      return NextResponse.json(
        { error: "Backup directory is required" },
        { status: 400 }
      );
    }

    // We DO NOT validate filesystem existence here. This endpoint runs
    // wherever the request hits the server (Vercel, local dev, etc.) — but
    // the user's intended backup target may be a local network path that's
    // only reachable from their workstation. The actual backup run is where
    // filesystem access matters; that path falls back to ZIP download if the
    // directory isn't reachable.

    const database = await db();
    const existing = await database.select().from(appSettings);

    if (existing.length > 0) {
      const result = await database
        .update(appSettings)
        .set({ backupDir })
        .where(eq(appSettings.id, existing[0].id))
        .returning();
      return NextResponse.json({
        ...result[0],
        backupDirResolved: resolveBackupDir(result[0].backupDir),
      });
    } else {
      const result = await database
        .insert(appSettings)
        .values({ backupDir })
        .returning();
      return NextResponse.json(
        {
          ...result[0],
          backupDirResolved: resolveBackupDir(result[0].backupDir),
        },
        { status: 201 }
      );
    }
  } catch (err) {
    console.error("[app-settings PUT] error:", err);
    return NextResponse.json(
      { error: "Failed to save app settings" },
      { status: 500 }
    );
  }
}
