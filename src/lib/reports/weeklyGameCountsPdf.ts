import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";

interface PlayerInfo {
  id: number;
  firstName: string;
  lastName: string;
  contractedFrequency: string;
  isActive: boolean;
}

interface GameAssignmentLite {
  playerId: number;
}

interface GameLite {
  weekNumber: number;
  status: string;
  group: string;
  assignments: GameAssignmentLite[];
}

interface Season {
  startDate: string;
  endDate: string;
  totalWeeks: number;
}

/**
 * Weekly Game Counts matrix.
 *   Rows = players (sorted by lastName), Contract players first then Subs.
 *   Cols = each week (1..N) + a Total column at the right.
 *   Cell = number of NORMAL Don's-group games that player was assigned in
 *          that week. Zeros render as "·" so non-zero values stand out.
 */
export function generateWeeklyGameCountsPdf(
  players: PlayerInfo[],
  games: GameLite[],
  season: Season
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);
  const totalWeeks = season.totalWeeks ?? 36;

  // Active players sorted: contract first, then subs; within each, by lastName.
  const sortedPlayers = [...players]
    .filter((p) => p.isActive)
    .sort((a, b) => {
      const aSub = a.contractedFrequency === "0" ? 1 : 0;
      const bSub = b.contractedFrequency === "0" ? 1 : 0;
      if (aSub !== bSub) return aSub - bSub;
      return a.lastName.localeCompare(b.lastName);
    });

  if (sortedPlayers.length === 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("No active players found.", pageWidth / 2, 80, { align: "center" });
    openPdfWithName(
      doc,
      `Weekly-Game-Counts-${startYear}-${endYear}`,
      "Weekly Game Counts"
    );
    return;
  }

  // Build per-player per-week counts. Only NORMAL Don's-group games count.
  const counts = new Map<number, Map<number, number>>(); // playerId → weekNum → count
  const weekColumnTotals = new Map<number, number>(); // weekNum → sum across players
  for (const g of games) {
    if (g.status !== "normal") continue;
    if (g.group !== "dons") continue;
    for (const a of g.assignments) {
      const wkMap = counts.get(a.playerId) ?? new Map<number, number>();
      wkMap.set(g.weekNumber, (wkMap.get(g.weekNumber) ?? 0) + 1);
      counts.set(a.playerId, wkMap);
      weekColumnTotals.set(g.weekNumber, (weekColumnTotals.get(g.weekNumber) ?? 0) + 1);
    }
  }

  // Layout constants. With ~36 week columns + name + total we need narrow cells.
  const marginLeft = 24;
  const marginRight = 24;
  const marginTop = 28;
  const usableW = pageWidth - marginLeft - marginRight;
  const nameColW = 78;
  const totalColW = 28;
  const weekColW = (usableW - nameColW - totalColW) / totalWeeks;
  const rowHeight = 12;
  const headerRowHeight = 14;

  const drawHeader = (y: number, pageLabel: string): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(
      `Weekly Game Counts — Brooklake Tennis ${startYear}-${endYear}`,
      pageWidth / 2,
      y,
      { align: "center" }
    );
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `Don's group · normal-status games only · counts per week${pageLabel ? ` · ${pageLabel}` : ""}`,
      pageWidth / 2,
      y,
      { align: "center" }
    );
    y += 10;
    return y;
  };

  let currentY = drawHeader(marginTop, "");

  // Column header row: "Player" | W1 | W2 | ... | WN | Total
  const drawColumnHeader = (y: number): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setFillColor(225, 225, 225);
    doc.rect(marginLeft, y, usableW, headerRowHeight, "F");
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.4);

    doc.text("Player", marginLeft + 4, y + headerRowHeight - 4);
    for (let w = 1; w <= totalWeeks; w++) {
      const cx = marginLeft + nameColW + (w - 0.5) * weekColW;
      doc.text(String(w), cx, y + headerRowHeight - 4, { align: "center" });
    }
    doc.text("Tot", marginLeft + nameColW + totalWeeks * weekColW + totalColW / 2, y + headerRowHeight - 4, { align: "center" });

    // vertical gridlines
    doc.line(marginLeft + nameColW, y, marginLeft + nameColW, y + headerRowHeight);
    for (let w = 1; w <= totalWeeks; w++) {
      const x = marginLeft + nameColW + w * weekColW;
      doc.line(x, y, x, y + headerRowHeight);
    }
    doc.rect(marginLeft, y, usableW, headerRowHeight, "S");
    return y + headerRowHeight;
  };

  currentY = drawColumnHeader(currentY);

  // Helper for new pages
  const ensureRowFits = (y: number): number => {
    if (y + rowHeight > pageHeight - 30) {
      doc.addPage();
      let ny = drawHeader(marginTop, `(continued)`);
      ny = drawColumnHeader(ny);
      return ny;
    }
    return y;
  };

  // Detect duplicate last names
  const lastNameCounts = new Map<string, number>();
  for (const p of sortedPlayers) {
    lastNameCounts.set(p.lastName, (lastNameCounts.get(p.lastName) ?? 0) + 1);
  }
  const displayName = (p: PlayerInfo) =>
    (lastNameCounts.get(p.lastName) ?? 0) > 1
      ? `${p.lastName}, ${p.firstName.charAt(0)}`
      : p.lastName;

  // Row rendering
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setLineWidth(0.25);

  let lastTierWasSub: boolean | null = null;
  let altRow = false;

  for (const p of sortedPlayers) {
    currentY = ensureRowFits(currentY);
    const isSub = p.contractedFrequency === "0";

    // Section divider between contract and subs
    if (lastTierWasSub === false && isSub === true) {
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.8);
      doc.line(marginLeft, currentY, marginLeft + usableW, currentY);
      doc.setLineWidth(0.25);
      doc.setDrawColor(180, 180, 180);
      currentY += 2;
      currentY = ensureRowFits(currentY);
    }
    lastTierWasSub = isSub;

    // Alternating zebra
    if (altRow) {
      doc.setFillColor(250, 247, 240);
      doc.rect(marginLeft, currentY, usableW, rowHeight, "F");
    }
    altRow = !altRow;

    doc.setDrawColor(220, 220, 220);

    // Player name
    doc.setFont("helvetica", "normal");
    doc.text(displayName(p), marginLeft + 4, currentY + rowHeight - 3);

    // Week cells
    let rowTotal = 0;
    const wkMap = counts.get(p.id);
    for (let w = 1; w <= totalWeeks; w++) {
      const c = wkMap?.get(w) ?? 0;
      rowTotal += c;
      const cx = marginLeft + nameColW + (w - 0.5) * weekColW;
      if (c > 0) {
        doc.text(String(c), cx, currentY + rowHeight - 3, { align: "center" });
      } else {
        doc.setTextColor(200, 200, 200);
        doc.text("·", cx, currentY + rowHeight - 3, { align: "center" });
        doc.setTextColor(0, 0, 0);
      }
    }

    // Total
    doc.setFont("helvetica", "bold");
    doc.text(
      String(rowTotal),
      marginLeft + nameColW + totalWeeks * weekColW + totalColW / 2,
      currentY + rowHeight - 3,
      { align: "center" }
    );

    // Right border for total column
    doc.line(
      marginLeft + nameColW + totalWeeks * weekColW,
      currentY,
      marginLeft + nameColW + totalWeeks * weekColW,
      currentY + rowHeight
    );

    currentY += rowHeight;
  }

  // Totals row at the bottom of the last page (or new page)
  currentY = ensureRowFits(currentY + 2);
  doc.setFillColor(230, 230, 230);
  doc.rect(marginLeft, currentY, usableW, rowHeight + 2, "F");
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, currentY, usableW, rowHeight + 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Total", marginLeft + 4, currentY + rowHeight - 2);

  let grandTotal = 0;
  for (let w = 1; w <= totalWeeks; w++) {
    const c = weekColumnTotals.get(w) ?? 0;
    grandTotal += c;
    const cx = marginLeft + nameColW + (w - 0.5) * weekColW;
    doc.text(c > 0 ? String(c) : "·", cx, currentY + rowHeight - 2, {
      align: "center",
    });
  }
  doc.text(
    String(grandTotal),
    marginLeft + nameColW + totalWeeks * weekColW + totalColW / 2,
    currentY + rowHeight - 2,
    { align: "center" }
  );

  openPdfWithName(
    doc,
    `Weekly-Game-Counts-${startYear}-${endYear}`,
    "Weekly Game Counts"
  );
}
