import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/db/getDb";
import { players } from "@/db/schema";
import { eq, like } from "drizzle-orm";

// Standard opt-out / opt-in keyword lists per the CTIA Short Code
// Monitoring Handbook and Twilio's carrier compliance guidance.
// Match case-insensitively on the trimmed body, first word only.
const OPT_OUT_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const OPT_IN_KEYWORDS = ["START", "YES", "UNSTOP"];

/**
 * Verify Twilio's HMAC-SHA1 signature per
 * https://www.twilio.com/docs/usage/webhooks/webhook-security. Signature
 * is HMAC-SHA1(authToken, fullUrl + sortedFormParams) base64-encoded.
 * Returns true when the signature matches OR when TWILIO_AUTH_TOKEN
 * isn't set (dev/no-token mode — logged as a warning).
 */
function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    console.warn("[twilio-webhook] TWILIO_AUTH_TOKEN is not set — signature check SKIPPED. Set it for production.");
    return true;
  }
  if (!signature) return false;
  const sorted = Object.keys(params).sort();
  const data = url + sorted.map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", token).update(data).digest("base64");
  // constant-time compare
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Extract the last 10 digits (US number) so we can match against
 * player.cellNumber regardless of formatting ("(555) 123-4567" vs
 * "+15551234567" vs "5551234567").
 */
function last10Digits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * POST /api/public/twilio-webhook
 *
 * Twilio POSTs form-encoded parameters here whenever the tennis
 * program's number receives an incoming SMS. We update the
 * corresponding player's sms_opt_out flag on STOP-family keywords and
 * clear it on START-family keywords. Response is empty TwiML so
 * Twilio's auto-reply (which the carrier delivers for STOP/START
 * anyway) is the user-visible confirmation.
 *
 * Configure this URL in the Twilio Console under Phone Numbers →
 * <your number> → Messaging Configuration → "A MESSAGE COMES IN"
 * webhook → https://<your-domain>/api/public/twilio-webhook (HTTP POST).
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const params: Record<string, string> = {};
    form.forEach((v, k) => { params[k] = String(v); });

    // Reconstruct the full public URL Twilio hit (X-Forwarded-Proto /
    // X-Forwarded-Host on Vercel).
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
    const fullUrl = `${proto}://${host}${request.nextUrl.pathname}`;
    const signature = request.headers.get("x-twilio-signature");

    if (!verifyTwilioSignature(fullUrl, params, signature)) {
      console.warn("[twilio-webhook] Signature verification failed. Rejecting.");
      return new NextResponse("<Response/>", { status: 403, headers: { "Content-Type": "text/xml" } });
    }

    const from = params["From"] ?? "";
    const body = (params["Body"] ?? "").trim();
    const firstWord = body.split(/\s+/)[0]?.toUpperCase() ?? "";
    const isOptOut = OPT_OUT_KEYWORDS.includes(firstWord);
    const isOptIn = OPT_IN_KEYWORDS.includes(firstWord);
    if (!isOptOut && !isOptIn) {
      // Not a keyword we care about; still return OK so Twilio doesn't retry.
      return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
    }

    const digits = last10Digits(from);
    if (!digits) {
      console.warn(`[twilio-webhook] Received keyword ${firstWord} from unparseable number ${from}`);
      return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
    }

    const database = await db();
    // Match player records whose cellNumber ends with these 10 digits.
    const matches = await database
      .select({ id: players.id, firstName: players.firstName, lastName: players.lastName, cellNumber: players.cellNumber })
      .from(players)
      .where(like(players.cellNumber, `%${digits.slice(0, 3)}%${digits.slice(3, 6)}%${digits.slice(6)}%`));

    // Loose LIKE catches most formatting; verify by re-extracting digits.
    const matchedIds = matches
      .filter((m) => (m.cellNumber ? last10Digits(m.cellNumber) === digits : false))
      .map((m) => m.id);

    if (matchedIds.length === 0) {
      console.warn(`[twilio-webhook] ${firstWord} from ${from} — no matching player.`);
      return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
    }

    const now = new Date().toISOString();
    for (const id of matchedIds) {
      if (isOptOut) {
        await database
          .update(players)
          .set({ smsOptOut: true, smsOptOutAt: now, smsOptOutReason: body.slice(0, 240) })
          .where(eq(players.id, id));
      } else {
        await database
          .update(players)
          .set({ smsOptOut: false, smsOptOutAt: now, smsOptOutReason: `Opt-in via ${firstWord}` })
          .where(eq(players.id, id));
      }
    }

    console.log(
      `[twilio-webhook] ${isOptOut ? "OPT-OUT" : "OPT-IN"} keyword "${firstWord}" from ${from} — updated ${matchedIds.length} player record(s).`
    );

    // Empty TwiML — the carrier delivers Twilio's auto STOP/START reply.
    return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("[twilio-webhook POST] error:", err);
    return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" }, status: 500 });
  }
}
