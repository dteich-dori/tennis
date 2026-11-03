import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/getDb";
import { emailSettings, players } from "@/db/schema";
import {
  sendEmail,
  sendBulkSms,
  hasSmsCapability,
  type EmailAttachment,
} from "@/lib/email";

/**
 * Delivery of swap / give-away notices. Text first by default
 * (email_settings.swap_channel = "sms-fallback"): the text goes out, and
 * email is the fallback when a player has no usable cell number, has opted
 * out of texts, or the text fails. No calendar files are sent: players edit
 * their own calendars and a notice must never overwrite them.
 */
export type NoticeChannel = "both" | "email" | "sms" | "sms-fallback";

export interface NoticeSettings {
  channel: NoticeChannel;
  fromName: string;
  replyTo?: string;
  adminCell: string;
  coordinatorPlayerId: number | null;
}

type PlayerRow = typeof players.$inferSelect;

export async function loadNoticeSettings(seasonId: number): Promise<NoticeSettings> {
  const database = await db();
  const [s] = await database.select().from(emailSettings).where(eq(emailSettings.seasonId, seasonId)).limit(1);
  const ch = s?.swapChannel;
  return {
    channel: ch === "both" || ch === "email" || ch === "sms" ? ch : "sms-fallback",
    fromName: s?.fromName || "Tennis Club",
    replyTo: s?.replyTo || undefined,
    adminCell: s?.swapAdminCell || "",
    coordinatorPlayerId: s?.swapCoordinatorPlayerId ?? null,
  };
}

export interface NoticeResult {
  playerId?: number;
  name: string;
  sent: boolean;
  via?: string;
  error?: string;
}

/** Send one player a notice by the configured channel. */
export async function deliverToPlayer(
  p: Pick<PlayerRow, "id" | "firstName" | "lastName" | "email" | "cellNumber" | "carrier" | "smsOptOut">,
  o: {
    settings: NoticeSettings;
    subject: string;
    emailText: string;
    smsText: string;
    attachments?: EmailAttachment[];
    label?: string;
  }
): Promise<NoticeResult> {
  const name = o.label ?? `${p.firstName} ${p.lastName}`;
  const hasEmail = !!p.email?.trim();
  const hasSms = !p.smsOptOut && hasSmsCapability(p.cellNumber, p.carrier);
  const errors: string[] = [];

  const email = async () => {
    if (!hasEmail) { errors.push("no email address"); return false; }
    const r = await sendEmail({
      to: p.email!, subject: o.subject, text: o.emailText,
      fromName: o.settings.fromName, replyTo: o.settings.replyTo, attachments: o.attachments,
    });
    if (!r.success) errors.push(`email: ${r.error}`);
    return r.success;
  };
  const sms = async () => {
    if (!hasSms) { errors.push("no usable cell number"); return false; }
    const r = await sendBulkSms(
      [{ name, phone: p.cellNumber!, carrier: p.carrier ?? undefined }], o.smsText, o.settings.fromName
    );
    if (r.errors.length) errors.push(...r.errors);
    return r.smsSent > 0;
  };

  const via: string[] = [];
  const ch = o.settings.channel;
  if (ch === "email") { if (await email()) via.push("email"); }
  else if (ch === "both") {
    if (await sms()) via.push("text");
    if (await email()) via.push("email");
  } else {
    //  "sms" and "sms-fallback": text first, email when a text is not possible.
    if (await sms()) via.push("text");
    else if (await email()) via.push("email");
  }
  return via.length > 0
    ? { playerId: p.id, name, sent: true, via: via.join(" + ") }
    : { playerId: p.id, name, sent: false, error: errors.join("; ") || "not sent" };
}

/** Text a bare number (the admin's own cell). */
async function textNumber(label: string, phone: string, text: string, fromName: string): Promise<NoticeResult> {
  if (!hasSmsCapability(phone)) return { name: label, sent: false, error: "no usable cell number" };
  const r = await sendBulkSms([{ name: label, phone }], text, fromName);
  return r.smsSent > 0
    ? { name: label, sent: true, via: "text" }
    : { name: label, sent: false, error: r.errors.join("; ") || "not sent" };
}

/**
 * The copies that go with every swap / give-away: to whoever issued it
 * (the delegate's own cell, or the admin cell from settings when it came
 * from the admin Swap tab) and to the game coordinator. Anyone already
 * notified as an affected player is skipped, and so is a number that
 * repeats.
 */
export async function notifyIssuerAndCoordinator(opts: {
  settings: NoticeSettings;
  issuerPlayerId?: number | null;
  affectedPlayerIds: number[];
  subject: string;
  text: string;
}): Promise<NoticeResult[]> {
  const { settings, issuerPlayerId, affectedPlayerIds, subject, text } = opts;
  const database = await db();
  const wantIds = [issuerPlayerId, settings.coordinatorPlayerId].filter((x): x is number => !!x);
  const rows = wantIds.length ? await database.select().from(players).where(inArray(players.id, wantIds)) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: NoticeResult[] = [];
  const seen = new Set<string>();
  const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "");

  const toPlayer = async (id: number, role: string) => {
    const p = byId.get(id);
    if (!p || affectedPlayerIds.includes(id)) return;
    const d = digits(p.cellNumber);
    if (d && seen.has(d)) return;
    if (d) seen.add(d);
    out.push(await deliverToPlayer(p, {
      settings, subject, emailText: text, smsText: text,
      label: `${p.firstName} ${p.lastName} (${role})`,
    }));
  };

  if (issuerPlayerId) await toPlayer(issuerPlayerId, "issued it");
  else if (settings.adminCell.trim()) {
    const d = digits(settings.adminCell);
    if (!seen.has(d)) {
      seen.add(d);
      out.push(await textNumber("Admin (issued it)", settings.adminCell, text, settings.fromName));
    }
  }
  if (settings.coordinatorPlayerId && settings.coordinatorPlayerId !== issuerPlayerId) {
    await toPlayer(settings.coordinatorPlayerId, "coordinator");
  }
  return out;
}
