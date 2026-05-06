import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";

function resolveBackupDir(dir: string | undefined | null): string | null {
  const value = (dir ?? "").trim();
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

interface AppSettingsResponse {
  id?: number;
  backupDir: string;
  backupDirResolved: string | null;
  backupDir2: string | null;
  backupDir2Resolved: string | null;
}

function shapeResponse(row: {
  id?: number;
  backupDir?: string | null;
  backupDir2?: string | null;
}): AppSettingsResponse {
  const primary = row.backupDir ?? "Backup";
  return {
    id: row.id,
    backupDir: primary,
    backupDirResolved:
      resolveBackupDir(primary) ?? path.join(process.cwd(), "Backup"),
    backupDir2: row.backupDir2 ?? null,
    backupDir2Resolved: resolveBackupDir(row.backupDir2 ?? null),
  };
}

export async function GET() {
  try {
    const database = await db();
    const rows = await database.select().from(appSettings);

    if (rows.length === 0) {
      return NextResponse.json(
        shapeResponse({ backupDir: "Backup", backupDir2: null })
      );
    }
    return NextResponse.json(shapeResponse(rows[0]));
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
    const body = (await request.json()) as {
      backupDir?: string;
      backupDir2?: string | null;
    };

    // Trim both inputs. Empty/missing secondary clears it.
    const backupDir = (body.backupDir ?? "").trim();
    const backupDir2Raw =
      body.backupDir2 === undefined ? undefined : (body.backupDir2 ?? "").trim();

    if (backupDir === "") {
      return NextResponse.json(
        { error: "Backup directory is required" },
        { status: 400 }
      );
    }

    // Filesystem existence is NOT validated here — the configured paths may
    // live on the user's local network and only be reachable from their
    // workstation, not from Vercel. Backup run handles fallback to ZIP.

    const database = await db();
    const existing = await database.select().from(appSettings);

    // Build the set object: only include backupDir2 if explicitly provided
    // in the body (so omitting it doesn't accidentally clear it).
    const updates: { backupDir: string; backupDir2?: string | null } = {
      backupDir,
    };
    if (backupDir2Raw !== undefined) {
      updates.backupDir2 = backupDir2Raw === "" ? null : backupDir2Raw;
    }

    if (existing.length > 0) {
      const result = await database
        .update(appSettings)
        .set(updates)
        .where(eq(appSettings.id, existing[0].id))
        .returning();
      return NextResponse.json(shapeResponse(result[0]));
    } else {
      const result = await database
        .insert(appSettings)
        .values(updates)
        .returning();
      return NextResponse.json(shapeResponse(result[0]), { status: 201 });
    }
  } catch (err) {
    console.error("[app-settings PUT] error:", err);
    return NextResponse.json(
      { error: "Failed to save app settings" },
      { status: 500 }
    );
  }
}
