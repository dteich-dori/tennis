import nodemailer from "nodemailer";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeToE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
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

    const sendResult = await sendEmail({ to: email, subject, text, fromName, replyTo, attachments });
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
}

export async function sendBulkSms(
  recipients: SmsRecipient[],
  text: string,
  _fromName: string
): Promise<BulkResult> {
  const result: BulkResult = { sent: 0, smsSent: 0, errors: [], skipped: [], recipients: [] };

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    result.errors.push("Twilio is not configured — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to environment variables");
    return result;
  }

  const twilio = (await import("twilio")).default;
  const client = twilio(accountSid, authToken);

  for (const r of recipients) {
    const to = normalizeToE164(r.phone);
    if (!to) {
      result.skipped.push(`${r.name} (invalid phone: ${r.phone})`);
      continue;
    }
    try {
      await client.messages.create({ body: text, from: fromNumber, to });
      result.smsSent++;
      result.recipients.push(`${r.name} (SMS)`);
    } catch (err) {
      result.errors.push(`${r.name} (SMS): ${String(err)}`);
    }
  }

  return result;
}
