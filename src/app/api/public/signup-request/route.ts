import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { signupRequests } from "@/db/schema";

/**
 * POST /api/public/signup-request
 * PUBLIC endpoint — no auth required. Reachable from the /join form.
 *
 * Body: {
 *   firstName, lastName, cellNumber?, carrier?, email?, notes?,
 *   consentGiven: boolean,
 *   consentText: string (snapshot of the exact opt-in text the user saw)
 * }
 *
 * Consent snapshot + IP + user-agent are captured for A2P 10DLC audit
 * evidence. Submissions land in "pending" status; an admin approves
 * (or rejects) them from the internal review UI before the person
 * becomes a real player.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      firstName?: string;
      lastName?: string;
      cellNumber?: string;
      carrier?: string;
      email?: string;
      notes?: string;
      consentGiven?: boolean;
      consentText?: string;
    };

    const firstName = (body.firstName ?? "").trim();
    const lastName = (body.lastName ?? "").trim();
    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required." },
        { status: 400 }
      );
    }
    if (body.consentGiven !== true) {
      return NextResponse.json(
        { error: "You must check the consent box to submit the form." },
        { status: 400 }
      );
    }
    if (!body.consentText || body.consentText.length < 10) {
      return NextResponse.json(
        { error: "Missing consent text snapshot." },
        { status: 400 }
      );
    }
    if (!body.cellNumber && !body.email) {
      return NextResponse.json(
        { error: "Please provide a cell number or an email address so we can contact you." },
        { status: 400 }
      );
    }

    // Capture forensic metadata for the consent audit trail.
    const consentIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;
    const consentUserAgent = request.headers.get("user-agent") ?? null;

    const database = await db();
    const [row] = await database
      .insert(signupRequests)
      .values({
        firstName,
        lastName,
        cellNumber: body.cellNumber?.trim() || null,
        carrier: body.carrier?.trim() || null,
        email: body.email?.trim() || null,
        notes: body.notes?.trim() || null,
        consentGiven: true,
        consentText: body.consentText,
        consentIp,
        consentUserAgent,
        status: "pending",
      })
      .returning();

    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  } catch (err) {
    console.error("[public/signup-request POST] error:", err);
    return NextResponse.json(
      { error: "Sorry, we couldn't record your submission right now. Please try again shortly, or contact the club directly." },
      { status: 500 }
    );
  }
}
