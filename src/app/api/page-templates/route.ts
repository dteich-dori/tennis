import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { pageTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { TEMPLATE_SLOTS, getDefaultContent } from "@/lib/pageTemplateDefaults";

// Admin-only editing of page templates (auth-gated by middleware).
// The public read path lives at /api/public/page-templates.

/** GET — list all slots with current effective content (override or default). */
export async function GET() {
  try {
    const database = await db();
    let rows: { key: string; content: string; updatedAt: string }[] = [];
    try {
      rows = await database.select().from(pageTemplates);
    } catch {
      /* table missing — return all defaults */
    }
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const out = TEMPLATE_SLOTS.map((slot) => {
      const row = byKey.get(slot.key);
      return {
        key: slot.key,
        label: slot.label,
        helpText: slot.helpText,
        contentType: slot.contentType,
        content: row?.content ?? slot.defaultContent,
        isOverride: !!row,
        updatedAt: row?.updatedAt ?? null,
        defaultContent: slot.defaultContent,
      };
    });
    return NextResponse.json(out);
  } catch (err) {
    console.error("[page-templates GET] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** PUT — upsert content for a specific key. */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { key?: string; content?: string };
    const key = (body.key ?? "").trim();
    const content = body.content ?? "";
    if (!key) {
      return NextResponse.json({ error: "key is required." }, { status: 400 });
    }
    if (!TEMPLATE_SLOTS.some((s) => s.key === key)) {
      return NextResponse.json({ error: `Unknown template key: ${key}` }, { status: 400 });
    }
    const database = await db();
    const now = new Date().toISOString();
    const [existing] = await database
      .select({ key: pageTemplates.key })
      .from(pageTemplates)
      .where(eq(pageTemplates.key, key));
    if (existing) {
      await database
        .update(pageTemplates)
        .set({ content, updatedAt: now })
        .where(eq(pageTemplates.key, key));
    } else {
      await database
        .insert(pageTemplates)
        .values({ key, content, updatedAt: now });
    }
    return NextResponse.json({ ok: true, key, updatedAt: now });
  } catch (err) {
    console.error("[page-templates PUT] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** DELETE ?key=X — remove override so the default takes over again. */
export async function DELETE(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "key is required." }, { status: 400 });
    }
    const database = await db();
    await database.delete(pageTemplates).where(eq(pageTemplates.key, key));
    return NextResponse.json({
      ok: true,
      key,
      restoredDefault: getDefaultContent(key).length > 0,
    });
  } catch (err) {
    console.error("[page-templates DELETE] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Keep `and` import warmed for future use.
void and;
