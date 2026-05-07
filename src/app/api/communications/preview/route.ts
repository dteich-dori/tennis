import { NextRequest, NextResponse } from "next/server";
import { loadAccountSummariesForSeason } from "@/lib/loadAccountSummaries";
import {
  buildContext,
  substituteTemplate,
} from "@/lib/templateSubstitute";

/**
 * POST /api/communications/preview
 * Body: { seasonId, playerId, subject, body }
 * Returns: { subject, body, unknownTokens, summary }
 *
 * Renders the email subject + body as the given player would see it, so the
 * admin can verify {firstName}, {balance}, etc. resolve correctly before
 * sending.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId?: number;
      playerId?: number;
      subject?: string;
      body?: string;
    };

    if (!body.seasonId || !body.playerId) {
      return NextResponse.json(
        { error: "seasonId and playerId required" },
        { status: 400 }
      );
    }

    const subject = body.subject ?? "";
    const text = body.body ?? "";

    const { byPlayerId } = await loadAccountSummariesForSeason(body.seasonId);
    const summary = byPlayerId.get(body.playerId);

    if (!summary) {
      return NextResponse.json(
        {
          error:
            "Player not found in this season's account summaries (subs without games and inactive players are excluded).",
        },
        { status: 404 }
      );
    }

    const ctx = buildContext(summary);
    const renderedSubject = substituteTemplate(subject, ctx);
    const renderedBody = substituteTemplate(text, ctx);

    const unknownTokens = [
      ...new Set([
        ...renderedSubject.unknownTokens,
        ...renderedBody.unknownTokens,
      ]),
    ];

    return NextResponse.json({
      subject: renderedSubject.text,
      body: renderedBody.text,
      unknownTokens,
      summary: {
        firstName: summary.firstName,
        lastName: summary.lastName,
        contract: summary.contractLabel,
        scheduledGames: summary.scheduledGames,
        fee: summary.fee,
        deposits: summary.deposits,
        balance: summary.balance,
        depositDue: summary.depositDue,
      },
    });
  } catch (err) {
    console.error("[communications/preview] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
