import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { pageTemplates } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getDefaultContent, TEMPLATE_SLOTS } from "@/lib/pageTemplateDefaults";

// Public GET — /sms-terms and /join both fetch template content
// through this endpoint (no auth required so the public pages can
// render). Admin edits go through /api/page-templates (auth-gated).
//
// Query:
//   ?key=<slot>            — one slot
//   ?keys=slot1,slot2,...  — many
//   (nothing)              — every known slot
//
// Response: { [key]: content }
// Falls back to the hardcoded default for any slot that has no row.
export async function GET(request: NextRequest) {
  try {
    const database = await db();
    const singleKey = request.nextUrl.searchParams.get("key");
    const keysParam = request.nextUrl.searchParams.get("keys");

    let requestedKeys: string[];
    if (singleKey) requestedKeys = [singleKey];
    else if (keysParam) requestedKeys = keysParam.split(",").map((s) => s.trim()).filter(Boolean);
    else requestedKeys = TEMPLATE_SLOTS.map((s) => s.key);

    let rows: { key: string; content: string }[] = [];
    try {
      rows = await database
        .select({ key: pageTemplates.key, content: pageTemplates.content })
        .from(pageTemplates)
        .where(inArray(pageTemplates.key, requestedKeys));
    } catch {
      // Table doesn't exist yet — no overrides, defaults win.
    }
    const byKey = new Map(rows.map((r) => [r.key, r.content]));

    const out: Record<string, string> = {};
    for (const k of requestedKeys) {
      out[k] = byKey.get(k) ?? getDefaultContent(k);
    }
    // Serve fresh on each request — the admin can edit any moment.
    return NextResponse.json(out, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[public/page-templates GET] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Keep the eq import used (for future single-lookup optimisation).
void eq;
