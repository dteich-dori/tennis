import nodemailer from "nodemailer";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// SMS gateway domains by carrier. AT&T's plain SMS gateway (txt.att.net) is
// frequently rejected by Gmail's SMTP as an invalid recipient — using the
// MMS gateway (mms.att.net) is far more reliable. It accepts the same
// plain-text payload our sendEmail helper produces.
const SMS_GATEWAYS: Record<string, string> = {
  verizon: "vtext.com",
  att: "txt.att.net",
  tmobile: "tmomail.net",
  sprint: "messaging.sprintpcs.com",
  uscellular: "email.uscc.net",
  boost: "sms.myboostmobile.com",
  cricket: "sms.cricketwireless.net",
  metro: "mymetropcs.com",
  googlefi: "msg.fi.google.com",
  consumercellular: "mailmymobile.net",
  mint: "tmomail.net",
  visible: "vtext.com",
  xfinity: "vtext.com",
  republic: "msg.republic.com",
};

export function getSmsGatewayEmail(phone: string, carrier: string): string | null {
  const domain = SMS_GATEWAYS[carrier];
  if (!domain) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `${digits}@${domain}`;
}

export function validateTwilioConfig(): string | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const keySid = process.env.TWILIO_API_KEY_SID;
  const keySecret = process.env.TWILIO_API_KEY_SECRET;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !keySid || !keySecret || !from) {
    return "TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, or TWILIO_FROM_NUMBER is not configured";
  }
  return null;
}

// True if a player can receive a text. Twilio is the only supported
// transport now — the carrier-gateway fallback path was retired
// (v1.199). A valid 10-digit US cell number is sufficient; carrier is
// no longer required.
//
// The `carrier` parameter is retained for backwards compatibility with
// callers that still pass it but is intentionally ignored.
export function hasSmsCapability(phone?: string | null, _carrier?: string | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return false;
  return true;
}

async function sendSmsViaTwilio(phone: string, body: string): Promise<{ success: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const keySid = process.env.TWILIO_API_KEY_SID!;
  const keySecret = process.env.TWILIO_API_KEY_SECRET!;
  const from = process.env.TWILIO_FROM_NUMBER!;
  const digits = phone.replace(/\D/g, "");
  const to = `+1${digits}`;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keySid}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Twilio error ${res.status}: ${errText}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export function validateEmailConfig(): string | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return "GMAIL_USER or GMAIL_APP_PASSWORD is not configured";
  }
  return null;
}

function createTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

/**
 * Wrap a plain-text email body in a minimal, mobile-friendly HTML
 * skeleton. Preserves the plain-text layout via <pre> + pre-wrap so
 * the same content renders identically in both parts, but bumps the
 * base font size to 16px and sets a proper viewport so iOS Mail and
 * Gmail don't shrink the text on small screens.
 */
export function buildMobileFriendlyHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<style>
body { margin:0; padding:14px; background:#fff; color:#111; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
.wrap { max-width:640px; margin:0 auto; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:1.45; }
pre { white-space:pre-wrap; word-wrap:break-word; font-family:inherit; font-size:inherit; margin:0; }
/* Compact on narrow screens */
@media (max-width: 480px) {
  body { padding:10px; }
  .wrap { font-size:13px; line-height:1.4; }
}
@media (prefers-color-scheme: dark) { body { background:#111; color:#eee; } }
</style>
</head>
<body>
<div class="wrap"><pre>${escaped}</pre></div>
</body>
</html>`;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  fromName,
  replyTo,
  attachments,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}): Promise<{ success: boolean; error?: string }> {
  const configError = validateEmailConfig();
  if (configError) return { success: false, error: configError };

  try {
    const transporter = createTransport();
    await transporter.sendMail({
      from: `${fromName} <${process.env.GMAIL_USER}>`,
      to,
      replyTo: replyTo || undefined,
      subject,
      text,
      html: html || undefined,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export interface Recipient {
  name: string;
  email: string;
}

export interface BulkResult {
  sent: number;
  smsSent: number;
  errors: string[];
  skipped: string[];
  recipients: string[]; // names of successfully sent
}

export async function sendBulkEmails(
  recipients: Recipient[],
  subject: string,
  text: string,
  fromName: string,
  replyTo?: string,
  attachments?: EmailAttachment[]
): Promise<BulkResult> {
  const result: BulkResult = { sent: 0, smsSent: 0, errors: [], skipped: [], recipients: [] };

  const configError = validateEmailConfig();
  if (configError) {
    result.errors.push(configError);
    return result;
  }

  for (const r of recipients) {
    const email = r.email.replace(/\s/g, "");
    if (!EMAIL_REGEX.test(email)) {
      result.skipped.push(`${r.name} (invalid email: ${r.email})`);
      continue;
    }

    // Same mobile-friendly HTML twin as the personalized-send path uses,
    // so a bulk-identical send is just as readable on a phone.
    const sendResult = await sendEmail({ to: email, subject, text, html: buildMobileFriendlyHtml(text), fromName, replyTo, attachments });
    if (sendResult.success) {
      result.sent++;
      result.recipients.push(r.name);
    } else {
      result.errors.push(`${r.name}: ${sendResult.error}`);
    }
  }

  return result;
}

export interface SmsRecipient {
  name: string;
  phone: string;
  carrier?: string;
}

export async function sendBulkSms(
  recipients: SmsRecipient[],
  text: string,
  fromName: string
): Promise<BulkResult> {
  const result: BulkResult = { sent: 0, smsSent: 0, errors: [], skipped: [], recipients: [] };

  // Twilio is the only supported SMS transport (v1.200+). If the
  // config isn't visible to the running server, error out with a
  // clear message pointing to the diagnostic endpoint instead of
  // silently falling back to carrier-gateway emails.
  const twilioConfigError = validateTwilioConfig();
  if (twilioConfigError) {
    result.errors.push(
      `SMS is not sendable from this server: ${twilioConfigError}. ` +
      `Visit /api/admin/twilio-config to see which env vars are missing, ` +
      `set them in Vercel → Settings → Environment Variables (Production), ` +
      `and redeploy.`
    );
    return result;
  }
  // fromName is unused now that we no longer route via SMS gateway
  // emails, but the parameter is kept for signature compatibility.
  void fromName;

  for (const r of recipients) {
    const digits = r.phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      result.skipped.push(`${r.name} (invalid phone: ${r.phone})`);
      continue;
    }

    const sendResult = await sendSmsViaTwilio(r.phone, text);
    if (sendResult.success) {
      result.smsSent++;
      result.recipients.push(`${r.name} (SMS)`);
    } else {
      result.errors.push(`${r.name} (SMS): ${sendResult.error}`);
    }
  }

  return result;
}
