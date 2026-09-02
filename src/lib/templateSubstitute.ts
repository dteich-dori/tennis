/**
 * Per-recipient template substitution for Communications emails.
 *
 * Tokens are case-INsensitive: `{firstName}`, `{firstname}`, `{FIRSTNAME}` all
 * work. Unknown tokens (e.g. typos like `{firstanme}`) are reported back to
 * the caller so the UI can warn the admin before sending.
 */

import type { AccountSummary } from "./playerAccountSummary";

/** All available variables admins can use in email subject + body. */
export const TEMPLATE_VARIABLES: Array<{
  token: string;
  description: string;
  example: string;
}> = [
  { token: "firstName",   description: "Player's first name",                       example: "Alice" },
  { token: "lastName",    description: "Player's last name",                        example: "Smith" },
  { token: "name",        description: "First Last",                                example: "Alice Smith" },
  { token: "contract",    description: "Contract tier label (1x / 2x / 2x+ / Sub)", example: "2x" },
  { token: "games",       description: "Don's games scheduled this season",         example: "72" },
  // --- Don's money. {fee}/{deposits}/{balance} are the original names;
  //     the dons* forms are aliases that pair visibly with the solo* set. ---
  { token: "fee",         description: "Don's total fee for the season (annual fee + extra charges)", example: "$1,500" },
  { token: "donsFee",     description: "Don's total fee — same value as {fee}",      example: "$1,500" },
  { token: "deposits",    description: "Don's deposits/payments paid so far",        example: "$500" },
  { token: "donsDeposits", description: "Don's deposits — same value as {deposits}", example: "$500" },
  { token: "balance",     description: "Don's balance due (fee − deposits − credit)", example: "$1,000" },
  { token: "donsBalance", description: "Don's balance due — same value as {balance}", example: "$1,000" },
  { token: "credit",      description: "Don's credit from the previous year's distribution", example: "$75" },
  { token: "donsCredit",  description: "Don's credit — same value as {credit}",      example: "$75" },
  // --- Solo money (billed separately from the Don's contract) ---
  { token: "soloGames",   description: "Contracted solo games for the season",       example: "20" },
  { token: "soloFee",     description: "Total solo fee (solo games × per-game rate)", example: "$600" },
  { token: "soloDeposit", description: "Deposits paid against the solo fee",         example: "$200" },
  { token: "soloCredit",  description: "Credit against the solo fee",               example: "$50" },
  { token: "soloBalance", description: "Solo balance due (solo fee − solo deposit − solo credit)", example: "$350" },
  { token: "stdDeposit",  description: "Standard deposit for this contract tier",   example: "$750" },
  { token: "depositDue",  description: "Standard deposit still owed (clamped to 0)", example: "$250" },
  { token: "extraGames",  description: "Extra-games count (2x+ players or subs)",   example: "3" },
  { token: "extraFee",    description: "Dollar amount charged for extras",          example: "$150" },
  { token: "blockedDays", description: "Comma-separated tennis-week days the player is blocked from", example: "Monday, Wednesday" },
  { token: "vacations",   description: "Bulleted list of vacation date ranges (each on its own line)", example: "• Fri, Dec 25, 2026\n• Mon, Jan 5, 2027 — Fri, Jan 9, 2027" },
];

/** Variable names lowercased, for case-insensitive lookup. */
const KNOWN = new Set(TEMPLATE_VARIABLES.map((v) => v.token.toLowerCase()));

const fmt$ = (n: number): string => {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return `${sign}$${v.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatVacationRange(v: { startDate: string; endDate: string }): string {
  const fmt = (yyyymmdd: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
    if (!m) return yyyymmdd;
    return new Date(yyyymmdd + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
    });
  };
  return v.startDate === v.endDate ? fmt(v.startDate) : `${fmt(v.startDate)} — ${fmt(v.endDate)}`;
}

export interface AvailabilityData {
  blockedDays: number[]; // day-of-week ints, 0=Sun … 6=Sat
  vacations: { startDate: string; endDate: string }[];
  daysPerWeek: number; // 5 = Mon-Fri, 6 = Mon-Sat, 7 = Sun-Sat
}

/**
 * Build the substitution context from a player's account summary. Callers
 * that want the {blockedDays} / {vacations} tokens to resolve should also
 * pass the player's availability data — omit it and those tokens fall back
 * to "None" / "None recorded." so the email still renders sensibly.
 */
export function buildContext(
  s: AccountSummary,
  availability?: AvailabilityData
): Record<string, string> {
  // Blocked days, filtered to the season's tennis-week days so a stray
  // checkbox for Sat/Sun on a 5-day week doesn't confuse the recipient.
  let blockedDaysStr = "None";
  let vacationsStr = "None recorded.";
  if (availability) {
    const { blockedDays, vacations, daysPerWeek } = availability;
    const tennisDays = daysPerWeek === 7
      ? [0, 1, 2, 3, 4, 5, 6]
      : daysPerWeek === 6
        ? [1, 2, 3, 4, 5, 6]
        : [1, 2, 3, 4, 5];
    const blockedSet = new Set(blockedDays);
    const blockedLabels = tennisDays.filter((d) => blockedSet.has(d)).map((d) => DAY_NAMES[d]);
    if (blockedLabels.length > 0) blockedDaysStr = blockedLabels.join(", ");
    if (vacations.length > 0) {
      vacationsStr = vacations
        .slice()
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((v) => `• ${formatVacationRange(v)}`)
        .join("\n");
    }
  }
  return {
    firstname: s.firstName,
    lastname: s.lastName,
    name: `${s.firstName} ${s.lastName}`,
    contract: s.contractLabel,
    games: String(s.scheduledGames),
    fee: fmt$(s.fee),
    donsfee: fmt$(s.fee),
    deposits: fmt$(s.deposits),
    donsdeposits: fmt$(s.deposits),
    balance: fmt$(s.balance),
    donsbalance: fmt$(s.balance),
    credit: fmt$(s.credit),
    donscredit: fmt$(s.credit),
    sologames: String(s.soloGames),
    solofee: fmt$(s.soloFee),
    solodeposit: fmt$(s.soloDeposit),
    solocredit: fmt$(s.soloCredit),
    solobalance: fmt$(s.soloBalance),
    stddeposit: fmt$(s.stdDeposit),
    depositdue: fmt$(s.depositDue),
    extragames: String(s.extraGames),
    extrafee: fmt$(s.extras),
    blockeddays: blockedDaysStr,
    vacations: vacationsStr,
  };
}

/**
 * A value counts as "empty/zero" (and thus suppresses an `{#if}` block) when:
 *   - it's an empty / whitespace-only string
 *   - it numerically parses to 0 (e.g. "0", "$0", "$0.00", "-$0")
 */
function isEmptyOrZero(v: string | undefined): boolean {
  if (v === undefined) return true;
  const trimmed = v.trim();
  if (trimmed === "") return true;
  // Strip currency symbols, commas, and a leading sign for the numeric check
  const numeric = trimmed.replace(/[$,\s]/g, "");
  const n = Number(numeric);
  return !Number.isNaN(n) && n === 0;
}

/**
 * Replace `{token}` patterns in `template` using `context` (case-insensitive)
 * AND honour `{#if token}...{/if}` blocks — block contents are dropped when
 * the token's value is empty or zero. `{#if}` blocks may not be nested.
 *
 * Returns the substituted text plus a list of any tokens that were neither in
 * `context` nor in the static known-variable set (likely typos).
 */
export function substituteTemplate(
  template: string,
  context: Record<string, string>
): { text: string; unknownTokens: string[] } {
  const unknown = new Set<string>();

  // 1. Resolve `{#if token}...{/if}` blocks first (non-greedy, dotall via [\s\S]).
  let withConditionals = template.replace(
    /\{#if\s+([a-zA-Z0-9_]+)\s*\}([\s\S]*?)\{\/if\}/g,
    (_full, name: string, inner: string) => {
      const key = name.toLowerCase();
      if (!KNOWN.has(key) && !(key in context)) {
        unknown.add(name);
        // Unknown condition variable — keep the inner text rather than
        // silently dropping it, so the admin notices.
        return inner;
      }
      return isEmptyOrZero(context[key]) ? "" : inner;
    }
  );

  // 2. Tidy: when a conditional block was on its own line, the resulting empty
  //    line is ugly. Collapse runs of 3+ newlines down to 2.
  withConditionals = withConditionals.replace(/\n{3,}/g, "\n\n");

  // 3. Replace remaining `{token}` substitutions.
  const text = withConditionals.replace(
    /\{([a-zA-Z0-9_]+)\}/g,
    (full, name: string) => {
      const key = name.toLowerCase();
      if (key in context) return context[key];
      if (KNOWN.has(key)) {
        // Recognised variable but absent from this context (shouldn't happen)
        return "";
      }
      unknown.add(name);
      return full; // Leave it literal so the admin can spot it in preview
    }
  );

  return { text, unknownTokens: [...unknown] };
}

/**
 * Returns true if the string contains at least one substitution token.
 * Used by the send endpoint to decide between the bulk-identical-text path
 * (fast) and the per-recipient personalised path (slower but personalised).
 */
export function templateHasVariables(s: string): boolean {
  return /\{[a-zA-Z0-9_]+\}/.test(s) || /\{#if\s+[a-zA-Z0-9_]+\s*\}/.test(s);
}
