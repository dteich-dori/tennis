import type jsPDF from "jspdf";

/**
 * Stamps "Mark #N · <date>" in the top-right corner of the CURRENT page.
 * Call once per page, or just on page 1 for short reports. The stamp lets
 * the admin tell at a glance whether two reports were generated against
 * the same schedule snapshot.
 *
 * The mark is a monotonic counter (seasons.schedule_version) that bumps
 * every time the schedule changes — auto-assign, manual assign/unassign,
 * holiday toggle, ball/pairing balance, etc.
 */
export function stampScheduleMark(
  doc: jsPDF,
  scheduleMark: number | undefined | null
): void {
  if (scheduleMark == null) return;
  const pageWidth = doc.internal.pageSize.getWidth();
  const stamp = `Mark #${scheduleMark} · ${new Date().toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" }
  )}`;
  const prevFont = doc.getFont();
  const prevSize = doc.getFontSize();
  const prevColor = doc.getTextColor();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(stamp, pageWidth - 20, 18, { align: "right" });
  doc.setFont(prevFont.fontName, prevFont.fontStyle);
  doc.setFontSize(prevSize);
  doc.setTextColor(prevColor);
}
