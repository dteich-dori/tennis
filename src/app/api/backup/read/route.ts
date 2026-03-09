import { NextRequest, NextResponse } from "next/server";
import { getBackupDir } from "@/lib/getBackupDir";
import path from "path";
import fs from "fs";

export async function GET(request: NextRequest) {
  try {
    const filePath = request.nextUrl.searchParams.get("file");
    if (!filePath) {
      return NextResponse.json({ error: "file parameter is required" }, { status: 400 });
    }

    // Sanitize: resolve and ensure it stays within configured backup dir
    const backupDir = await getBackupDir();
    const resolved = path.resolve(backupDir, filePath);
    if (!resolved.startsWith(backupDir)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const content = fs.readFileSync(resolved, "utf-8");
    return NextResponse.json({ content, filename: path.basename(resolved) });
  } catch (err) {
    console.error("[backup/read GET] error:", err);
    return NextResponse.json({ error: "Failed to read backup file" }, { status: 500 });
  }
}
