import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/getDb";
import { players } from "@/db/schema";

/**
 * The player a /swap-admin link belongs to, or null. The token is the only
 * credential, so an empty/short value never matches (a blank token column
 * must not be able to authenticate anyone), and an inactive player's link
 * stops working along with them.
 */
export async function getSwapAdmin(token: string) {
  if (!token || token.length < 16) return null;
  const database = await db();
  const [p] = await database
    .select()
    .from(players)
    .where(and(eq(players.swapAdminToken, token), isNotNull(players.swapAdminToken), eq(players.isActive, true)))
    .limit(1);
  return p ?? null;
}

/** Today's date (YYYY-MM-DD) in the club's time zone. */
export function todayEt(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
