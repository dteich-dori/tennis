import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";

export interface CallListEntry {
  lastName: string;
  firstName: string;
  cellNumber: string | null;
  homeNumber: string | null;
  email: string | null;
}

interface Season {
  startDate: string;
  endDate: string;
}

/**
 * Printable call list for a Communications recipient selection.
 *
 * Built for working the phone: names, both numbers, and a wide ruled
 * Notes column to write the outcome in. Rows are tall and lightly ruled
 * so there is room to write between them.
 */
export function generateCallListPdf(
  entries: CallListEntry[],
  groupLabel: string,
  season: Season
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  const pageWidth = doc.internal.pageSize.getWidth(); // 612
  const pageHeight = doc.internal.pageSize.getHeight(); // 792
  const marginLeft = 40;
  const marginRight = 40;
  const tableWidth = pageWidth - marginLeft - marginRight; // 532

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  //  Widths measured against the widest realistic value at 9pt: a
  //  20-character name and a formatted "(973) 377-2235" number. What is
  //  left goes to Notes, which is the point of the sheet.
  const columns = [
    { header: "Name", width: tableWidth * 0.26, align: "left" as const },
    { header: "Cell", width: tableWidth * 0.17, align: "left" as const },
    { header: "Home", width: tableWidth * 0.17, align: "left" as const },
    { header: "Notes", width: tableWidth * 0.4, align: "left" as const },
  ];

  const rowHeight = 26; // roomy — this gets written on
  const headerHeight = 22;
  let currentY = 0;

  function drawPageHeader() {
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Call List — ${groupLabel}`, pageWidth / 2, 40, { align: "center" });

    const today = new Date();
    const dateStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Brooklake ${startYear}-${endYear}  ·  ${entries.length} player${entries.length !== 1 ? "s" : ""}  ·  ${dateStr}`,
      pageWidth / 2,
      56,
      { align: "center" }
    );
    doc.setTextColor(0, 0, 0);
    currentY = 76;
  }

  function drawTableHeader() {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "S");
    let x = marginLeft;
    for (const col of columns) {
      doc.text(col.header, x + 4, currentY + 12);
      x += col.width;
    }
    currentY += headerHeight;
  }

  drawPageHeader();
  drawTableHeader();

  const sorted = [...entries].sort(
    (a, b) =>
      a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];

    // Leave room for the footer line.
    if (currentY + rowHeight > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      drawTableHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    }

    if (i % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
    }
    doc.setDrawColor(215, 215, 215);
    doc.setLineWidth(0.4);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

    // Column separators, so the Notes area reads as its own box.
    let sx = marginLeft;
    for (let c = 0; c < columns.length - 1; c++) {
      sx += columns[c].width;
      doc.line(sx, currentY - 2, sx, currentY - 2 + rowHeight);
    }

    const cells = [
      `${r.lastName}, ${r.firstName}`,
      r.cellNumber ?? "—",
      r.homeNumber ?? "—",
      "",
    ];

    let x = marginLeft;
    doc.setTextColor(0, 0, 0);
    for (let c = 0; c < columns.length; c++) {
      if (cells[c]) doc.text(cells[c], x + 4, currentY + 14);
      x += columns[c].width;
    }
    currentY += rowHeight;
  }

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const preparedText = `Prepared: ${dayNames[now.getDay()]}, ${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()} ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  const footerY = pageHeight - 20;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text(preparedText, marginLeft, footerY);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginRight, footerY, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  openPdfWithName(
    doc,
    `Call-List-${groupLabel.replace(/[^A-Za-z0-9]+/g, "-")}-${startYear}-${endYear}`,
    "Brooklake call list"
  );
}
