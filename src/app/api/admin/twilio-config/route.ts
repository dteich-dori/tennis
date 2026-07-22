import { NextResponse } from "next/server";
import { validateTwilioConfig } from "@/lib/email";

/**
 * GET /api/admin/twilio-config
 *
 * Reports whether the Twilio env vars are visible to the running
 * server. Never returns the actual secret values — only whether each
 * expected env var is set and, for the SID/from-number, a masked
 * excerpt so the admin can confirm they're the RIGHT values without
 * exposing the credentials.
 *
 * Use this when SMS sends are failing to figure out whether the
 * problem is on the server (env vars missing/wrong) vs. client
 * (recipient's cellNumber, opt-out flag, etc).
 */
export async function GET() {
  const acct = process.env.TWILIO_ACCOUNT_SID;
  const keySid = process.env.TWILIO_API_KEY_SID;
  const keySecret = process.env.TWILIO_API_KEY_SECRET;
  const from = process.env.TWILIO_FROM_NUMBER;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  const mask = (v: string | undefined, tail = 4) =>
    v ? `${v.slice(0, 4)}…${v.slice(-tail)} (len ${v.length})` : "MISSING";

  const validation = validateTwilioConfig();
  return NextResponse.json({
    // The validation function used by the send route. If this returns
    // anything other than null, SMS sends will fail on the server.
    validationResult: validation === null ? "OK — sends will attempt Twilio" : validation,
    envVars: {
      TWILIO_ACCOUNT_SID: mask(acct, 4),
      TWILIO_API_KEY_SID: mask(keySid, 4),
      TWILIO_API_KEY_SECRET: keySecret ? `SET (len ${keySecret.length})` : "MISSING",
      TWILIO_FROM_NUMBER: from ?? "MISSING",
      TWILIO_AUTH_TOKEN: authToken ? `SET (len ${authToken.length})` : "MISSING (webhook signatures unsigned)",
    },
    note: "If any var reads MISSING, set it in Vercel → Settings → Environment Variables (Production) and REDEPLOY — env changes don't take effect on running serverless functions until the next deploy.",
  });
}
