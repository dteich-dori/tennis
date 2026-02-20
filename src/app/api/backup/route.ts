import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

export async function POST() {
  try {
    // Only available in development mode
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json(
        { error: "Backup is only available in development mode" },
        { status: 403 }
      );
    }

    // Find the D1 SQLite database
    const d1Dir = path.join(
      process.cwd(),
      ".wrangler",
      "state",
      "v3",
      "d1",
      "miniflare-D1DatabaseObject"
    );

    const files = fs
      .readdirSync(d1Dir)
      .filter((f: string) => f.endsWith(".sqlite") && !f.includes("-shm") && !f.includes("-wal"));

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No database found to back up" },
        { status: 404 }
      );
    }

    const dbPath = path.join(d1Dir, files[0]);

    // Create backup directory with timestamp
    const now = new Date();
    const datePart = now.toISOString().split("T")[0]; // 2026-02-14
    const timePart = now.toTimeString().split(" ")[0].replace(/:/g, ""); // 111500
    const folderName = `${datePart}_${timePart}`;
    const backupDir = path.join(process.cwd(), "backups", folderName);
    fs.mkdirSync(backupDir, { recursive: true });

    // Checkpoint WAL to ensure all data is in the main file
    try {
      execSync(`sqlite3 "${dbPath}" "PRAGMA wal_checkpoint(TRUNCATE);"`, { timeout: 10000 });
    } catch {
      // WAL checkpoint failed — still try to copy
    }

    // Copy the database file
    const backupDbPath = path.join(backupDir, "tennis-scheduler.sqlite");
    fs.copyFileSync(dbPath, backupDbPath);

    // Create SQL dump
    try {
      const dump = execSync(`sqlite3 "${dbPath}" ".dump"`, { timeout: 30000 });
      fs.writeFileSync(path.join(backupDir, "full-dump.sql"), dump);
    } catch {
      // SQL dump failed — we still have the SQLite copy
    }

    // Export key tables as CSV
    const tables = [
      "seasons",
      "players",
      "court_schedules",
      "holidays",
      "player_blocked_days",
      "player_vacations",
      "player_do_not_pair",
      "games",
      "game_assignments",
      "ball_counts",
    ];

    for (const table of tables) {
      try {
        const csv = execSync(
          `sqlite3 -header -csv "${dbPath}" "SELECT * FROM ${table};"`,
          { timeout: 10000 }
        );
        fs.writeFileSync(path.join(backupDir, `${table.replace(/_/g, "-")}.csv`), csv);
      } catch {
        // Table might be empty or not exist — skip
      }
    }

    // Get record counts for the response
    let playerCount = 0;
    let courtCount = 0;
    let gameCount = 0;
    try {
      playerCount = parseInt(
        execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM players;"`, { timeout: 5000 }).toString().trim()
      );
      courtCount = parseInt(
        execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM court_schedules;"`, { timeout: 5000 }).toString().trim()
      );
      gameCount = parseInt(
        execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM games;"`, { timeout: 5000 }).toString().trim()
      );
    } catch {
      // Counts are informational only
    }

    return NextResponse.json({
      success: true,
      folder: folderName,
      path: backupDir,
      counts: {
        players: playerCount,
        courtSchedules: courtCount,
        games: gameCount,
      },
    });
  } catch (err) {
    console.error("[backup POST] error:", err);
    return NextResponse.json(
      { error: "Failed to create backup" },
      { status: 500 }
    );
  }
}
