import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";
import { stampScheduleMark } from "./scheduleMark";

interface AssignedPlayer {
  slot: number;        // 1-4
  lastName: string;
  firstName: string;
  skillLevel: string;
}

export interface IncompleteGameRow {
  weekNumber: number;
  gameNumber: number;
  date: string;        // YYYY-MM-DD
  dayOfWeek: number;   // 0-6
  startTime: string;
  courtNumber: number;
  group: "dons" | "solo";
  assigned: AssignedPlayer[];   // sorted by slot; 0-4 entries
  cappedSlots: number[];        // slot positions that are cap-empty marked
}

interface Season {
  startDate: string;
  endDate: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(yyyymmdd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : yyyymmdd;
}

function reasonFor(row: IncompleteGameRow): string {
  const emptyCount = 4 - row.assigned.length;
  const cappedCount = row.cappedSlots.length;
  if (emptyCount === 0) return "—";
  if (cappedCount === emptyCount) {
    return `Weekly cap (${cappedCount} slot${cappedCount === 1 ? "" : "s"} blocked by player cap)`;
  }
  if (cappedCount > 0) {
    return `${cappedCount} cap-blocked + ${emptyCount - cappedCount} no eligible candidate`;
  }
  return "No eligible candidates available";
}

/**
 * Incomplete Games report — one block per game with fewer than 4
 * assigned players. Shows week / game # / day / date / court / reason
 * and the assigned players in a 2x2 grid (top: slots 1-2, bottom: 3-4).
 * Empty slots show "— empty —"; slots marked as cap-empty are flagged
 * with "(CAP)".
 */
export function generateIncompleteGamesPdf(
  rows: IncompleteGameRow[],
  season: Season,
  scheduleMark?: number
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  stampScheduleMark(doc, scheduleMark);

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 40;
  const marginRight = 40;
  const tableWidth = pageWidth - marginLeft - marginRight;

  const title = `Incomplete Games — Brooklake ${startYear}-${endYear}`;
  const subtitle = `${rows.length} game${rows.length === 1 ? "" : "s"} with empty slots`;

  function drawPageHeader(): number {
    stampScheduleMark(doc, scheduleMark);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 40, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, pageWidth / 2, 56, { align: "center" });
    doc.setTextColor(0, 0, 0);
    return 80;
  }

  // Sort: by week ascending, then date, then game number.
  const sorted = [...rows].sort((a, b) => {
    if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.gameNumber - b.gameNumber;
  });

  let currentY = drawPageHeader();

  if (sorted.length === 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80, 80, 80);
    doc.text("No incomplete games. Every game is fully assigned.", pageWidth / 2, currentY + 30, { align: "center" });
    openPdfWithName(doc, `Incomplete-Games-${startYear}-${endYear}`, "Incomplete Games");
    return;
  }

  // Layout per game:
  //   header strip (1 line):   Wk N · Game #X · Day mm/dd/yy · 10:30 · Court Y · GROUP
  //   reason line (1 line):    Reason: ...
  //   2x2 player grid (2 lines): two rows of two cells, each cell = "Last, First (skill)"
  //
  // Each game block is ~64pt tall. Add a 6pt gap between blocks.
  const blockHeight = 72;

  function ensureSpace(needed: number) {
    if (currentY + needed > pageHeight - 40) {
      doc.addPage();
      currentY = drawPageHeader();
    }
  }

  function renderCell(text: string, x: number, y: number, w: number, h: number, isCapEmpty: boolean) {
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.rect(x, y, w, h, "S");
    if (isCapEmpty) {
      // amber dashed inner border, matching the on-screen marker style
      doc.setDrawColor(217, 119, 6);
      doc.setLineWidth(1);
      doc.setLineDashPattern([3, 2], 0);
      doc.rect(x + 1.5, y + 1.5, w - 3, h - 3, "S");
      doc.setLineDashPattern([], 0);
      doc.setLineWidth(0.5);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(isCapEmpty ? 146 : 0, isCapEmpty ? 64 : 0, 14);
    doc.text(text, x + 6, y + h / 2 + 3);
  }

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    ensureSpace(blockHeight + 6);

    // --- Header strip ---
    doc.setFillColor(245, 245, 245);
    doc.rect(marginLeft, currentY, tableWidth, 16, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY, tableWidth, 16, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const headerText = `Wk ${row.weekNumber} · Game #${row.gameNumber} · ${DAY_LABELS[row.dayOfWeek]} ${formatDate(row.date)} · ${row.startTime} · Court ${row.courtNumber} · ${row.group === "solo" ? "SOLO" : "Don's"}`;
    doc.text(headerText, marginLeft + 6, currentY + 12);

    // --- Reason line ---
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(120, 60, 20);
    doc.text(`Reason: ${reasonFor(row)}`, marginLeft + 6, currentY + 30);

    // --- 2x2 player grid ---
    const slotByPosition = new Map<number, AssignedPlayer>();
    for (const a of row.assigned) slotByPosition.set(a.slot, a);
    const cappedSet = new Set(row.cappedSlots);

    const cellW = tableWidth / 2;
    const cellH = 18;
    const gridTop = currentY + 36;

    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const slotPos = r * 2 + c + 1;   // 1, 2, 3, 4
        const p = slotByPosition.get(slotPos);
        const isCapEmpty = !p && cappedSet.has(slotPos);
        let text: string;
        if (p) {
          text = `${p.lastName}, ${p.firstName}${p.skillLevel ? ` (${p.skillLevel})` : ""}`;
        } else if (isCapEmpty) {
          text = "— empty (CAP) —";
        } else {
          text = "— empty —";
        }
        renderCell(text, marginLeft + c * cellW, gridTop + r * cellH, cellW, cellH, isCapEmpty);
      }
    }

    currentY += blockHeight + 6;
  }

  // Footer
  if (currentY + 24 > pageHeight - 30) {
    doc.addPage();
    currentY = drawPageHeader();
  }
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "italic");
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  doc.text(
    `${sorted.length} incomplete game${sorted.length === 1 ? "" : "s"} · Generated ${dateStr}`,
    marginLeft,
    currentY + 16
  );

  openPdfWithName(doc, `Incomplete-Games-${startYear}-${endYear}`, "Incomplete Games");
}
