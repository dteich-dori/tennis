import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { budgetItems } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const result = await database
      .select()
      .from(budgetItems)
      .where(eq(budgetItems.seasonId, parseInt(seasonId)));

    // Sort: income first, then expense, then by sortOrder
    result.sort((a, b) => {
      if (a.category !== b.category) return a.category === "income" ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[budget-items GET] error:", err);
    return NextResponse.json({ error: "Failed to load budget items" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId: number;
      category: string;
      name: string;
      amount: number;
      sortOrder?: number;
    };
    const { seasonId, category, name, amount, sortOrder } = body;

    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }
    if (category !== "income" && category !== "expense") {
      return NextResponse.json({ error: "category must be 'income' or 'expense'" }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof amount !== "number" || amount < 0) {
      return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }

    const database = await db();
    const result = await database
      .insert(budgetItems)
      .values({ seasonId, category, name: name.trim(), amount, sortOrder: sortOrder ?? 0 })
      .returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    console.error("[budget-items POST] error:", err);
    return NextResponse.json({ error: "Failed to create budget item" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id: number;
      name: string;
      amount: number;
      sortOrder?: number;
    };
    const { id, name, amount, sortOrder } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof amount !== "number" || amount < 0) {
      return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }

    const database = await db();
    const updates: Record<string, unknown> = { name: name.trim(), amount };
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const result = await database
      .update(budgetItems)
      .set(updates)
      .where(eq(budgetItems.id, id))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
    }
    return NextResponse.json(result[0]);
  } catch (err) {
    console.error("[budget-items PUT] error:", err);
    return NextResponse.json({ error: "Failed to update budget item" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const database = await db();
    await database.delete(budgetItems).where(eq(budgetItems.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[budget-items DELETE] error:", err);
    return NextResponse.json({ error: "Failed to delete budget item" }, { status: 500 });
  }
}
