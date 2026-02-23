import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { emailTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const result = await database
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.seasonId, parseInt(seasonId)));

    // Sort by name
    result.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[communications/templates GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId: number;
      name: string;
      subject: string;
      body: string;
    };
    const { seasonId, name, subject, body: templateBody } = body;

    if (!seasonId || !name || !subject) {
      return NextResponse.json(
        { error: "seasonId, name, and subject are required" },
        { status: 400 }
      );
    }

    const database = await db();
    const result = await database
      .insert(emailTemplates)
      .values({ seasonId, name, subject, body: templateBody })
      .returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    console.error("[communications/templates POST] error:", err);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id: number;
      name: string;
      subject: string;
      body: string;
    };
    const { id, name, subject, body: templateBody } = body;

    if (!id || !name || !subject) {
      return NextResponse.json(
        { error: "id, name, and subject are required" },
        { status: 400 }
      );
    }

    const database = await db();
    const result = await database
      .update(emailTemplates)
      .set({
        name,
        subject,
        body: templateBody,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(emailTemplates.id, id))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (err) {
    console.error("[communications/templates PUT] error:", err);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const database = await db();
    await database.delete(emailTemplates).where(eq(emailTemplates.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[communications/templates DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
