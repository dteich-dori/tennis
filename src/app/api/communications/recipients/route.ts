import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players, emailSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");
    const group = request.nextUrl.searchParams.get("group");

    if (!seasonId) {
      return NextResponse.json({ error: "seasonId required" }, { status: 400 });
    }
    if (!group) {
      return NextResponse.json({ error: "group required" }, { status: 400 });
    }

    const database = await db();

    // Test group: return the configured test email
    if (group === "Test") {
      const settings = await database
        .select()
        .from(emailSettings)
        .where(eq(emailSettings.seasonId, parseInt(seasonId)));

      const testEmail = settings.length > 0 ? settings[0].testEmail : "";
      if (!testEmail) {
        return NextResponse.json({
          recipients: [],
          count: 0,
          message: "No test email configured. Set one in Settings.",
        });
      }

      return NextResponse.json({
        recipients: [{ id: 0, firstName: "Test", lastName: "Recipient", email: testEmail }],
        count: 1,
      });
    }

    // Query active players (include phone + carrier so UI can show SMS capability)
    const allPlayers = await database
      .select({
        id: players.id,
        firstName: players.firstName,
        lastName: players.lastName,
        email: players.email,
        cellNumber: players.cellNumber,
        carrier: players.carrier,
        contractedFrequency: players.contractedFrequency,
      })
      .from(players)
      .where(
        and(
          eq(players.seasonId, parseInt(seasonId)),
          eq(players.isActive, true)
        )
      );

    // Only include players reachable by email or SMS
    let filtered = allPlayers.filter((p) => {
      const hasEmail = !!(p.email && p.email.trim());
      const hasSms = !!(p.cellNumber && p.carrier);
      return hasEmail || hasSms;
    });

    if (group === "Contract Players") {
      filtered = filtered.filter((p) => p.contractedFrequency !== "0");
    } else if (group === "Subs") {
      filtered = filtered.filter((p) => p.contractedFrequency === "0");
    }
    // "ALL" = no additional filter

    // Sort by last name, first name
    filtered.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
    );

    return NextResponse.json({
      recipients: filtered.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        cellNumber: p.cellNumber,
        carrier: p.carrier,
        hasEmail: !!(p.email && p.email.trim()),
        hasSms: !!(p.cellNumber && p.carrier),
      })),
      count: filtered.length,
    });
  } catch (err) {
    console.error("[communications/recipients GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load recipients" },
      { status: 500 }
    );
  }
}
