import nodemailer from "nodemailer";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// SMS gateway domains by carrier
const SMS_GATEWAYS: Record<string, string> = {
  verizon: "vtext.com",
  att: "txt.att.net",
  tmobile: "tmomail.net",
  sprint: "messaging.sprintpcs.com",
  uscellular: "email.uscc.net",
  boost: "sms.myboostmobile.com",
  cricket: "sms.cricketwireless.net",
  metro: "mymetropcs.com",
};

export function getSmsGatewayEmail(phone: string, carrier: string): string | null {
  const domain = SMS_GATEWAYS[carrier];
  if (!domain) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `${digits}@${domain}`;
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
  carrier: string;
}

export async function sendBulkSms(
  recipients: SmsRecipient[],
  text: string,
  fromName: string
): Promise<BulkResult> {
  const result: BulkResult = { sent: 0, smsSent: 0, errors: [], skipped: [], recipients: [] };

  const configError = validateEmailConfig();
  if (configError) {
    result.errors.push(configError);
    return result;
  }

  for (const r of recipients) {
    const gatewayEmail = getSmsGatewayEmail(r.phone, r.carrier);
    if (!gatewayEmail) {
      result.skipped.push(`${r.name} (invalid phone/carrier: ${r.phone}/${r.carrier})`);
      continue;
    }

    // SMS messages should be short — no subject line needed
    const sendResult = await sendEmail({
      to: gatewayEmail,
      subject: fromName,
      text,
      fromName,
    });
    if (sendResult.success) {
      result.smsSent++;
      result.recipients.push(`${r.name} (SMS)`);
    } else {
      result.errors.push(`${r.name} (SMS): ${sendResult.error}`);
    }
  }

  return result;
}
