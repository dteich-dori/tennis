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
  { token: "fee",         description: "Total fee charged for the season",          example: "$1,500" },
  { token: "deposits",    description: "Total deposits/payments paid so far",       example: "$500" },
  { token: "balance",     description: "Outstanding balance owed",                  example: "$1,000" },
  { token: "stdDeposit",  description: "Standard deposit for this contract tier",   example: "$750" },
  { token: "depositDue",  description: "Standard deposit still owed (clamped to 0)", example: "$250" },
  { token: "extraGames",  description: "Extra-games count (2x+ players or subs)",   example: "3" },
  { token: "extraFee",    description: "Dollar amount charged for extras",          example: "$150" },
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

/**
 * Build the substitution context from a player's account summary.
 * Caller is responsible for passing the right summary for each recipient.
 */
export function buildContext(s: AccountSummary): Record<string, string> {
  return {
    firstname: s.firstName,
    lastname: s.lastName,
    name: `${s.firstName} ${s.lastName}`,
    contract: s.contractLabel,
    games: String(s.scheduledGames),
    fee: fmt$(s.fee),
    deposits: fmt$(s.deposits),
    balance: fmt$(s.balance),
    stddeposit: fmt$(s.stdDeposit),
    depositdue: fmt$(s.depositDue),
    extragames: String(s.extraGames),
    extrafee: fmt$(s.extras),
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
