import { NextRequest, NextResponse } from "next/server";
import { getBackupDir } from "@/lib/getBackupDir";
import path from "path";
import fs from "fs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { filename: string; content: string };
    const { filename, content } = body;

    if (!filename || !content) {
      return NextResponse.json(
        { error: "filename and content are required" },
        { status: 400 }
      );
    }

    // Sanitize filename to prevent directory traversal
    const safeName = path.basename(filename);

    // Save to configured backup directory
    const backupDir = await getBackupDir();
    fs.mkdirSync(backupDir, { recursive: true });

    const filePath = path.join(backupDir, safeName);
    fs.writeFileSync(filePath, content, "utf-8");

    return NextResponse.json({
      success: true,
      path: filePath,
      filename: safeName,
    });
  } catch (err) {
    console.error("[export-csv POST] error:", err);
    return NextResponse.json(
      { error: "Failed to save CSV file" },
      { status: 500 }
    );
  }
}
