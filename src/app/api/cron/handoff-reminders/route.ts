import { NextRequest, NextResponse } from "next/server";
import { runHandoffReminders } from "@/lib/handoffReminders";

/** GET /api/cron/handoff-reminders — manual/standalone trigger. Auth: Bearer CRON_SECRET. */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ success: true, ...(await runHandoffReminders()) });
}
