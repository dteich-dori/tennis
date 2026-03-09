import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const database = await db();
    const rows = await database.select().from(appSettings);

    if (rows.length === 0) {
      return NextResponse.json({ backupDir: "Backup" });
    }

    return NextResponse.json(rows[0]);
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
    const { backupDir } = body;

    if (!backupDir || backupDir.trim() === "") {
      return NextResponse.json(
        { error: "Backup directory is required" },
        { status: 400 }
      );
    }

    // Resolve the path for validation
    const resolved = path.isAbsolute(backupDir)
      ? backupDir
      : path.join(process.cwd(), backupDir);

    // Validate the directory exists or can be created
    if (!fs.existsSync(resolved)) {
      try {
        fs.mkdirSync(resolved, { recursive: true });
      } catch {
        return NextResponse.json(
          { error: `Directory does not exist and could not be created: ${resolved}` },
          { status: 400 }
        );
      }
    }

    // Verify it is actually a directory
    if (!fs.statSync(resolved).isDirectory()) {
      return NextResponse.json(
        { error: `Path is not a directory: ${resolved}` },
        { status: 400 }
      );
    }

    const database = await db();
    const existing = await database.select().from(appSettings);

    if (existing.length > 0) {
      const result = await database
        .update(appSettings)
        .set({ backupDir: backupDir.trim() })
        .where(eq(appSettings.id, existing[0].id))
        .returning();
      return NextResponse.json(result[0]);
    } else {
      const result = await database
        .insert(appSettings)
        .values({ backupDir: backupDir.trim() })
        .returning();
      return NextResponse.json(result[0], { status: 201 });
    }
  } catch (err) {
    console.error("[app-settings PUT] error:", err);
    return NextResponse.json(
      { error: "Failed to save app settings" },
      { status: 500 }
    );
  }
}
