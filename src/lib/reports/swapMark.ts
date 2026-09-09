import type jsPDF from "jspdf";

/**
 * Point size of the swap serial suffix.
 *
 * Deliberately smaller than any row font — it is a cross-reference, not
 * a name — but 5pt proved too small to read on a printed sheet.
 */
export const SWAP_SERIAL_FONT_SIZE = 6;

/**
 * Draw a player name followed by its swap serial — e.g. "Teich(1)".
 *
 * Both halves of a swap carry the same number, so a printed sheet can be
 * read as a pair: the same "(1)" appears on the other player's row, on
 * their Games By Player sheet, and on the Games By Date schedule.
 *
 * The suffix is drawn as its own text run rather than baked into the
 * string, so it keeps its size whatever the row's font size is — and so
 * that every report agrees on that size, which they did not while this
 * lived twice.
 */
export function drawNameWithSwap(
  doc: jsPDF,
  name: string,
  swapSerial: number | null | undefined,
  x: number,
  y: number
): void {
  doc.text(name, x, y);
  if (swapSerial == null) return;
  const size = doc.getFontSize();
  const w = doc.getTextWidth(name);
  doc.setFontSize(SWAP_SERIAL_FONT_SIZE);
  doc.text(`(${swapSerial})`, x + w + 0.5, y);
  doc.setFontSize(size);
}
