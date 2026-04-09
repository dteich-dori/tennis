import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/getDb";
import { players, emailSettings, emailLog, games, gameAssignments } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  sendBulkEmails,
  sendBulkSms,
  sendEmail,
  validateEmailConfig,
  type Recipient,
  type SmsRecipient,
} from "@/lib/email";
import { generatePlayerIcs } from "@/lib/ics";

interface EmailRecipientWithPlayer {
  name: string;
  email: string;
  playerId: number | null; // null for Test recipient
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      seasonId: number;
      recipientGroup: string;
      subject: string;
      body: string;
      fromName: string;
      replyTo: string;
      channel?: "email" | "sms" | "both";
      attachPersonalSchedule?: boolean;
      testAsPlayerId?: number | null;
      icsFirstEventOnly?: boolean;
    };
    const {
      seasonId,
      recipientGroup,
      subject,
      body: messageBody,
      fromName,
      replyTo,
      channel = "both",
      attachPersonalSchedule = false,
      testAsPlayerId = null,
      icsFirstEventOnly = false,
    } = body;

    if (!seasonId || !subject || !messageBody) {
      return NextResponse.json(
        { error: "seasonId, subject, and body are required" },
        { status: 400 }
      );
    }

    const configError = validateEmailConfig();
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 500 });
    }

    const database = await db();

    // Load settings for test phone/carrier
    const settingsRows = await database
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.seasonId, seasonId));
    const settings = settingsRows[0];

    const emailRecipients: EmailRecipientWithPlayer[] = [];
    const smsRecipients: SmsRecipient[] = [];
    const recipientNamesForLog: string[] = [];

    if (recipientGroup === "Test") {
      const testEmail = settings?.testEmail || "";
      const testPhone = settings?.testPhone || "";
      const testCarrier = settings?.testCarrier || "";
      const hasTestEmail = !!testEmail;
      const hasTestSms = !!(testPhone && testCarrier);

      if (!hasTestEmail && !hasTestSms) {
        return NextResponse.json(
          { error: "No test email or phone configured. Set one in Settings." },
          { status: 400 }
        );
      }

      // For test + attachPersonalSchedule, resolve which player's schedule to generate.
      // Priority: explicit testAsPlayerId from the client → email match → null (no attachment).
      let testPlayerId: number | null = null;
      if (attachPersonalSchedule) {
        if (testAsPlayerId != null) {
          testPlayerId = testAsPlayerId;
        } else if (hasTestEmail) {
          const testPlayerRow = await database
            .select({ id: players.id })
            .from(players)
            .where(and(eq(players.seasonId, seasonId), eq(players.email, testEmail)))
            .limit(1);
          if (testPlayerRow[0]) testPlayerId = testPlayerRow[0].id;
        }
      }

      if (channel === "email") {
        if (hasTestEmail) emailRecipients.push({ name: "Test", email: testEmail, playerId: testPlayerId });
      } else if (channel === "sms") {
        if (hasTestSms) {
          smsRecipients.push({ name: "Test", phone: testPhone, carrier: testCarrier });
        } else if (hasTestEmail) {
          emailRecipients.push({ name: "Test (SMS fallback)", email: testEmail, playerId: testPlayerId });
        }
      } else {
        // "both" — send via both channels
        if (hasTestEmail) emailRecipients.push({ name: "Test", email: testEmail, playerId: testPlayerId });
        if (hasTestSms) smsRecipients.push({ name: "Test", phone: testPhone, carrier: testCarrier });
      }

      recipientNamesForLog.push("Test");
    } else {
      // Query active players (include phone + carrier)
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
            eq(players.seasonId, seasonId),
            eq(players.isActive, true)
          )
        );

      // Filter by group
      let filtered = allPlayers;
      if (recipientGroup === "Contract Players") {
        filtered = allPlayers.filter((p) => p.contractedFrequency !== "0");
      } else if (recipientGroup === "Subs") {
        filtered = allPlayers.filter((p) => p.contractedFrequency === "0");
      }

      // Build email / SMS recipient lists based on channel
      for (const p of filtered) {
        const name = `${p.firstName} ${p.lastName}`;
        const hasEmail = !!(p.email && p.email.trim());
        const hasSms = !!(p.cellNumber && p.carrier);

        if (channel === "email") {
          if (hasEmail) emailRecipients.push({ name, email: p.email!, playerId: p.id });
        } else if (channel === "sms") {
          if (hasSms) {
            smsRecipients.push({ name, phone: p.cellNumber!, carrier: p.carrier! });
          } else if (hasEmail) {
            // Fallback to email when no SMS configured
            emailRecipients.push({ name, email: p.email!, playerId: p.id });
          }
        } else {
          // "both" — send to both channels where available (may overlap)
          if (hasEmail) emailRecipients.push({ name, email: p.email!, playerId: p.id });
          if (hasSms) smsRecipients.push({ name, phone: p.cellNumber!, carrier: p.carrier! });
        }
        if (hasEmail || hasSms) recipientNamesForLog.push(name);
      }
    }

    if (emailRecipients.length === 0 && smsRecipients.length === 0) {
      return NextResponse.json(
        { error: "No recipients with valid email or SMS setup found in this group." },
        { status: 400 }
      );
    }

    // --- Prepare ICS data if the personal schedule attachment was requested ---
    // Build a map playerId -> Game[] (normal games only), plus a Player lookup map.
    let playerGamesMap: Map<number, {
      id: number;
      gameNumber: number;
      seasonId: number;
      weekNumber: number;
      date: string;
      dayOfWeek: number;
      startTime: string;
      courtNumber: number;
      group: string;
      status: string;
      holidayName?: string | null;
      assignments: { id: number; gameId: number; playerId: number; slotPosition: number; isPrefill: boolean }[];
    }[]> | null = null;
    let playerLookup: Map<number, { id: number; firstName: string; lastName: string }> | null = null;

    if (attachPersonalSchedule && emailRecipients.length > 0) {
      // 1. Fetch all season games
      const allGames = await database
        .select()
        .from(games)
        .where(eq(games.seasonId, seasonId));

      // 2. Fetch assignments in batches of 50 (mirroring /api/games route)
      const gameIds = allGames.map((g) => g.id);
      const allAssignments: { id: number; gameId: number; playerId: number; slotPosition: number; isPrefill: boolean }[] = [];
      const BATCH_SIZE = 50;
      for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
        const batch = gameIds.slice(i, i + BATCH_SIZE);
        const batchResults = await database
          .select()
          .from(gameAssignments)
          .where(inArray(gameAssignments.gameId, batch));
        allAssignments.push(...batchResults);
      }

      // 3. Group assignments by gameId
      const assignmentsByGame = new Map<number, typeof allAssignments>();
      for (const a of allAssignments) {
        const existing = assignmentsByGame.get(a.gameId) ?? [];
        existing.push(a);
        assignmentsByGame.set(a.gameId, existing);
      }

      // 4. Build enriched games array (each game with its assignments)
      const enrichedGames = allGames.map((game) => ({
        ...game,
        assignments: (assignmentsByGame.get(game.id) ?? []).sort(
          (a, b) => a.slotPosition - b.slotPosition
        ),
      }));

      // 5. Build playerGamesMap (mirrors gamesByPlayerPdf.ts lines 104-120)
      playerGamesMap = new Map();
      for (const game of enrichedGames) {
        if (game.status !== "normal") continue;
        for (const a of game.assignments) {
          const arr = playerGamesMap.get(a.playerId) ?? [];
          arr.push(game);
          playerGamesMap.set(a.playerId, arr);
        }
      }
      // Sort games within each player by date → time → court
      for (const [, list] of playerGamesMap) {
        list.sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
          return a.courtNumber - b.courtNumber;
        });
      }

      // 6. Player lookup map (all active players)
      const allActivePlayers = await database
        .select({ id: players.id, firstName: players.firstName, lastName: players.lastName })
        .from(players)
        .where(and(eq(players.seasonId, seasonId), eq(players.isActive, true)));
      playerLookup = new Map(allActivePlayers.map((p) => [p.id, p]));
    }

    // --- Send emails ---
    let emailsSent = 0;
    const emailErrors: string[] = [];
    const emailSkipped: string[] = [];
    const icsWarnings: string[] = [];

    if (attachPersonalSchedule && playerGamesMap && playerLookup) {
      // Per-recipient attachment path: iterate manually so each gets their own ICS.
      for (const r of emailRecipients) {
        // Resolve the player to generate against
        let playerForIcs: { id: number; firstName: string; lastName: string } | undefined;
        if (r.playerId != null) {
          playerForIcs = playerLookup.get(r.playerId);
        }

        let attachments: { filename: string; content: string; contentType: string }[] | undefined;
        if (playerForIcs) {
          const allTheirGames = playerGamesMap.get(playerForIcs.id) ?? [];
          // When previewing as Test, optionally limit to the first game to avoid
          // flooding the tester's calendar with a full season of events.
          const theirGames = icsFirstEventOnly && allTheirGames.length > 0
            ? [allTheirGames[0]]
            : allTheirGames;
          if (theirGames.length > 0) {
            try {
              const icsString = generatePlayerIcs(playerForIcs, theirGames, playerLookup);
              if (icsString) {
                attachments = [{
                  filename: "brooklake-schedule.ics",
                  content: icsString,
                  contentType: "text/calendar; charset=utf-8; method=PUBLISH",
                }];
              }
            } catch (err) {
              icsWarnings.push(`${r.name}: ICS generation failed — ${String(err)}`);
            }
          } else {
            icsWarnings.push(`${r.name}: no games in season — sent without attachment`);
          }
        } else {
          icsWarnings.push(`${r.name}: no matching player record — sent without attachment`);
        }

        const result = await sendEmail({
          to: r.email,
          subject,
          text: messageBody,
          fromName,
          replyTo,
          attachments,
        });
        if (result.success) {
          emailsSent++;
        } else {
          emailErrors.push(`${r.name}: ${result.error}`);
        }
      }
    } else if (emailRecipients.length > 0) {
      // Standard bulk-send path (no attachments).
      const plainRecipients: Recipient[] = emailRecipients.map((r) => ({ name: r.name, email: r.email }));
      const bulkResult = await sendBulkEmails(plainRecipients, subject, messageBody, fromName, replyTo);
      emailsSent = bulkResult.sent;
      emailErrors.push(...bulkResult.errors);
      emailSkipped.push(...bulkResult.skipped);
    }

    // --- Send SMS (unchanged — no attachment possible) ---
    let smsResult = { sent: 0, smsSent: 0, errors: [] as string[], skipped: [] as string[], recipients: [] as string[] };
    if (smsRecipients.length > 0) {
      smsResult = await sendBulkSms(smsRecipients, messageBody, fromName);
    }

    const totalSent = emailsSent + smsResult.smsSent;
    const channelLabel =
      channel === "email" ? "Email" : channel === "sms" ? "Text" : "Email+Text";
    const logGroupLabel = attachPersonalSchedule
      ? `${recipientGroup} (${channelLabel}+ICS)`
      : `${recipientGroup} (${channelLabel})`;

    // Log the send
    await database.insert(emailLog).values({
      seasonId,
      subject,
      body: messageBody,
      recipientGroup: logGroupLabel,
      recipientCount: totalSent,
      recipientList: recipientNamesForLog.join(", "),
      fromName,
      replyTo: replyTo || "",
    });

    const warnings = [
      ...emailSkipped,
      ...emailErrors,
      ...icsWarnings,
      ...smsResult.skipped,
      ...smsResult.errors,
    ];

    return NextResponse.json({
      success: true,
      recipientCount: totalSent,
      emailsSent,
      smsSent: smsResult.smsSent,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    console.error("[communications/send POST] error:", err);
    return NextResponse.json(
      { error: "Failed to send messages" },
      { status: 500 }
    );
  }
}
