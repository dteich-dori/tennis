import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { budgetParams } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULTS = {
  weeksPerSeason: 36,
  gameDurationHours: 1.5,
  costPerCourtPerHour: 1740,
  priceDons1: 0,
  priceDons2: 0,
  priceDons2plus: 0,
  priceSubs: 0,
  priceSolo: 0,
  priceExtraHour: 23,
};

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }

    const database = await db();
    const result = await database
      .select()
      .from(budgetParams)
      .where(eq(budgetParams.seasonId, parseInt(seasonId)));

    if (result.length === 0) {
      return NextResponse.json(DEFAULTS);
    }
    return NextResponse.json(result[0]);
  } catch (err) {
    console.error("[budget-params GET] error:", err);
    return NextResponse.json({ error: "Failed to load budget params" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId: number;
      weeksPerSeason: number;
      gameDurationHours: number;
      costPerCourtPerHour: number;
      priceDons1: number;
      priceDons2: number;
      priceDons2plus: number;
      priceSubs: number;
      priceSolo: number;
      priceExtraHour: number;
    };
    const {
      seasonId, weeksPerSeason, gameDurationHours, costPerCourtPerHour,
      priceDons1, priceDons2, priceDons2plus, priceSubs, priceSolo, priceExtraHour,
    } = body;

    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }
    if (typeof weeksPerSeason !== "number" || weeksPerSeason < 1 || weeksPerSeason > 52) {
      return NextResponse.json({ error: "weeksPerSeason must be between 1 and 52" }, { status: 400 });
    }
    if (typeof gameDurationHours !== "number" || gameDurationHours <= 0) {
      return NextResponse.json({ error: "gameDurationHours must be a positive number" }, { status: 400 });
    }
    if (typeof costPerCourtPerHour !== "number" || costPerCourtPerHour <= 0) {
      return NextResponse.json({ error: "costPerCourtPerHour must be a positive number" }, { status: 400 });
    }

    const database = await db();
    const existing = await database
      .select()
      .from(budgetParams)
      .where(eq(budgetParams.seasonId, seasonId));

    if (existing.length > 0) {
      const result = await database
        .update(budgetParams)
        .set({ weeksPerSeason, gameDurationHours, costPerCourtPerHour, priceDons1, priceDons2, priceDons2plus, priceSubs, priceSolo, priceExtraHour })
        .where(eq(budgetParams.seasonId, seasonId))
        .returning();
      return NextResponse.json(result[0]);
    } else {
      const result = await database
        .insert(budgetParams)
        .values({ seasonId, weeksPerSeason, gameDurationHours, costPerCourtPerHour, priceDons1, priceDons2, priceDons2plus, priceSubs, priceSolo, priceExtraHour })
        .returning();
      return NextResponse.json(result[0], { status: 201 });
    }
  } catch (err) {
    console.error("[budget-params PUT] error:", err);
    return NextResponse.json({ error: "Failed to save budget params" }, { status: 500 });
  }
}
