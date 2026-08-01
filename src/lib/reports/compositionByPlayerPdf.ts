import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";
import { stampScheduleMark } from "./scheduleMark";
import { APP_VERSION } from "@/lib/version";

interface CompositionInfo {
  key: string;
  description: string;
}

interface PlayerRow {
  playerId: number;
  firstName: string;
  lastName: string;
  skillLevel: string;
  counts: Record<string, number>;
}

interface Season {
  startDate: string;
  endDate: string;
}

function getCellColor(count: number): [number, number, number] {
  if (count <= 0) return [255, 255, 255];
  if (count <= 2) return [220, 245, 220];
  if (count <= 5) return [170, 220, 170];
  if (count <= 10) return [255, 245, 180];
  if (count <= 15) return [255, 210, 140];
  if (count <= 20) return [255, 170, 130];
  return [255, 140, 140];
}

export function generateCompositionByPlayerPdf(
  compositions: CompositionInfo[],
  rows: PlayerRow[],
  season: Season,
  scheduleMark?: number,
  incompleteGames?: number,
  incompleteSlots?: number
): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "letter",
  });
  stampScheduleMark(doc, scheduleMark);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  if (rows.length === 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("No player data available.", pageWidth / 2, 80, { align: "center" });
    openPdfWithName(doc, `Composition-By-Player-${startYear}-${endYear}`, "Brooklake Game-Level Distribution");
    return;
  }

  const sortedRows = [...rows].sort(
    (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  );

  // Duplicate last name detection for disambiguation
  const lastNameCounts = new Map<string, number>();
  for (const r of sortedRows) {
    lastNameCounts.set(r.lastName, (lastNameCounts.get(r.lastName) ?? 0) + 1);
  }
  const getDisplayName = (r: PlayerRow): string =>
    (lastNameCounts.get(r.lastName) ?? 0) > 1 ? `${r.lastName}, ${r.firstName.charAt(0)}` : r.lastName;

  const cols = [...compositions, { key: "TOTAL", description: "Total games" }];

  // Column totals across ALL players (not just the current page)
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;
  for (const c of compositions) colTotals[c.key] = 0;
  for (const r of sortedRows) {
    for (const c of compositions) {
      const n = r.counts[c.key] ?? 0;
      colTotals[c.key] += n;
      grandTotal += n;
    }
  }

  const marginLeft = 20;
  const marginRight = 10;
  const headerBottom = 22;
  const footerTop = pageHeight - 2;
  const headerRowHeight = 26;
  const rowHeaderWidth = 95;
  const skillColWidth = 20;

  const availableWidth = pageWidth - marginLeft - marginRight - rowHeaderWidth - skillColWidth;
  const colWidth = Math.max(24, Math.min(availableWidth / cols.length, 44));
  const rowHeight = 14;
  // Reserve room below the data rows on every page for the totals row +
  // the incomplete-games/slots summary line, so the last page never runs
  // out of space mid-footer.
  const footerReserve = rowHeight + 16;
  const rowsPerPage = Math.max(
    1,
    Math.floor((footerTop - headerBottom - headerRowHeight - footerReserve) / rowHeight)
  );

  const totalPages = Math.ceil(sortedRows.length / rowsPerPage);

  // Draws one grid row (player data, or the TOTALS row) at the given y.
  function drawGridRow(
    y: number,
    label: string,
    skillLevel: string,
    getCount: (colKey: string) => number,
    isTotalsRow: boolean
  ) {
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", isTotalsRow ? "bold" : "normal");
    doc.text(label, marginLeft + rowHeaderWidth - 4, y + rowHeight / 2 + 3, { align: "right" });
    if (skillLevel) {
      doc.setFont("helvetica", "bold");
      doc.text(skillLevel, marginLeft + rowHeaderWidth + skillColWidth / 2, y + rowHeight / 2 + 3, {
        align: "center",
      });
    }

    const gridX = marginLeft + rowHeaderWidth + skillColWidth;
    for (let col = 0; col < cols.length; col++) {
      const x = gridX + col * colWidth;
      const isTotalCol = cols[col].key === "TOTAL";
      const count = getCount(cols[col].key);

      if (isTotalsRow) {
        doc.setFillColor(210, 210, 220);
      } else if (isTotalCol) {
        doc.setFillColor(230, 230, 230);
      } else {
        const [cr, cg, cb] = getCellColor(count);
        doc.setFillColor(cr, cg, cb);
      }
      doc.rect(x, y, colWidth, rowHeight, "F");
      doc.setDrawColor(isTotalsRow ? 120 : 200, isTotalsRow ? 120 : 200, isTotalsRow ? 120 : 200);
      doc.setLineWidth(isTotalsRow ? 0.6 : 0.3);
      doc.rect(x, y, colWidth, rowHeight, "S");

      if (count > 0) {
        doc.setFontSize(7);
        doc.setFont("helvetica", isTotalsRow || isTotalCol ? "bold" : "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(String(count), x + colWidth / 2, y + rowHeight / 2 + 2.5, { align: "center" });
      }
    }
  }

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) doc.addPage();
    const pageRows = sortedRows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
    const isLastPage = page === totalPages - 1;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    const pageSuffix = totalPages > 1 ? ` (page ${page + 1}/${totalPages})` : "";
    doc.text(
      `Player Game-Level Distribution — ${startYear} - ${endYear}${pageSuffix}`,
      pageWidth / 2,
      14,
      { align: "center" }
    );
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`v${APP_VERSION}`, marginLeft, 14);
    doc.setTextColor(0, 0, 0);

    const gridX = marginLeft + rowHeaderWidth + skillColWidth;
    const gridY = headerBottom + headerRowHeight;

    // Column headers
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    for (let col = 0; col < cols.length; col++) {
      const x = gridX + col * colWidth + colWidth / 2;
      doc.text(cols[col].key, x, gridY - 6, { align: "center" });
    }

    // Player rows
    for (let row = 0; row < pageRows.length; row++) {
      const r = pageRows[row];
      const y = gridY + row * rowHeight;
      let total = 0;
      for (const c of compositions) total += r.counts[c.key] ?? 0;
      drawGridRow(
        y,
        getDisplayName(r),
        r.skillLevel,
        (colKey) => (colKey === "TOTAL" ? total : r.counts[colKey] ?? 0),
        false
      );
    }

    // Vertical divider between row headers and the grid
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.line(marginLeft + rowHeaderWidth, gridY - headerRowHeight, marginLeft + rowHeaderWidth, gridY + pageRows.length * rowHeight);

    if (isLastPage) {
      const totalsY = gridY + pageRows.length * rowHeight + 4;
      drawGridRow(
        totalsY,
        "TOTAL",
        "",
        (colKey) => (colKey === "TOTAL" ? grandTotal : colTotals[colKey] ?? 0),
        true
      );

      const summaryY = totalsY + rowHeight + 12;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(
        `Incomplete games: ${incompleteGames ?? 0}    Incomplete slots: ${incompleteSlots ?? 0}`,
        marginLeft,
        summaryY
      );
    }
  }

  openPdfWithName(doc, `Composition-By-Player-${startYear}-${endYear}`, "Brooklake Game-Level Distribution");
}
