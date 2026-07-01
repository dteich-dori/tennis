import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { signupRequests } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/signup-requests?status=pending|approved|rejected|all
 *
 * Returns signup submissions from the public /join form. Admin-only
 * (protected by the site auth middleware). Default status filter is
 * "pending".
 */
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") ?? "pending";
    const database = await db();

    if (status === "all") {
      const rows = await database
        .select()
        .from(signupRequests)
        .orderBy(desc(signupRequests.createdAt));
      return NextResponse.json(rows);
    }

    const rows = await database
      .select()
      .from(signupRequests)
      .where(eq(signupRequests.status, status))
      .orderBy(desc(signupRequests.createdAt));
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[signup-requests GET] error:", err);
    return NextResponse.json(
      { error: "Failed to load signup requests." },
      { status: 500 }
    );
  }
}
