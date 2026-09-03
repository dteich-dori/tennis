/**
 * Minimal **bold** support for Communications templates.
 *
 * Templates are authored as plain text, and every HTML builder escapes
 * `<` and `>` before inserting the body — so a real <b> tag can never
 * survive to the inbox, by design. Instead an admin writes **bold**,
 * and this converts that marker after escaping.
 *
 * The pattern deliberately will not span a line break and will not
 * contain another asterisk, so a stray "**" in ordinary prose is left
 * alone rather than swallowing the rest of the message.
 */
const BOLD_RE = /\*\*([^*\n]+?)\*\*/g;

/**
 * Convert **bold** markers to <strong>.
 *
 * MUST be applied to text that has ALREADY been HTML-escaped — it
 * introduces the only tags allowed through, so calling it on raw input
 * would let a template inject arbitrary markup.
 */
export function boldToHtml(escaped: string): string {
  return escaped.replace(BOLD_RE, "<strong>$1</strong>");
}

/**
 * Drop the markers for plain-text email bodies and SMS, where bold
 * can't be represented and the asterisks would otherwise show up as
 * stray punctuation.
 */
export function stripBoldMarkers(text: string): string {
  return text.replace(BOLD_RE, "$1");
}
