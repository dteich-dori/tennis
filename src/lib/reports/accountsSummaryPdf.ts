import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";
import { stampScheduleMark } from "./scheduleMark";

interface AccountRow {
  lastName: string;
  firstName: string;
  contractedFrequency: string; // "0" (sub) | "1" | "2" | "2+"
  scheduledGames: number;
  extraGames: number; // 2x+ extras above 2/wk, OR all games for subs
  fee: number;        // total fee (base + extras)
  base: number;       // annual/contract fee for the tier ($0 for subs)
  extras: number;     // charge for extra games
  deposits: number;   // sum of payments
  credit?: number;    // prior-year distribution credit
  balance: number;    // fee - deposits - credit (negative = credit)
  noCharge?: boolean; // comped — fee is $0, no season or per-game charge
}

interface Season {
  startDate: string;
  endDate: string;
}

interface RatesSummary {
  priceDons1: number;
  priceDons2: number;
  priceExtraHour: number;
  priceSubs: number;
}

const fmt$ = (n: number): string => {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return `${sign}$${v.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

export function generateAccountsSummaryPdf(
  rows: AccountRow[],
  season: Season,
  rates: RatesSummary,
  scheduleMark?: number
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });
  stampScheduleMark(doc, scheduleMark);

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  const pageWidth = doc.internal.pageSize.getWidth(); // 612
  const pageHeight = doc.internal.pageSize.getHeight(); // 792
  const marginLeft = 40;
  const marginRight = 40;
  const tableWidth = pageWidth - marginLeft - marginRight;

  const title = `Accounts Summary — Brooklake Don's Group ${startYear} - ${endYear}`;

  function drawPageHeader() {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 40, { align: "center" });

    const today = new Date();
    const dateStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`As of ${dateStr}`, pageWidth / 2, 56, { align: "center" });

    doc.setFontSize(9);
    const ratesLine = `Rates: 1x ${fmt$(rates.priceDons1)} · 2x ${fmt$(rates.priceDons2)} · Extra game ${fmt$(rates.priceExtraHour)} · Sub per game ${fmt$(rates.priceSubs)}`;
    doc.text(ratesLine, pageWidth / 2, 70, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  drawPageHeader();
  let currentY = 90;

  // Column layout
  const columns = [
    //  Widths are measured, not guessed: each is the wider of its header
    //  and its widest possible value at 9pt Helvetica, plus 4pt padding
    //  either side. The name column is held to the minimum that fits the
    //  longest roster name, and the slack goes to the money columns.
    { header: "Last, First", width: tableWidth * 0.1955, align: "left" as const },
    { header: "Contract", width: tableWidth * 0.0885, align: "center" as const },
    { header: "Games", width: tableWidth * 0.0755, align: "right" as const },
    { header: "Extra Gms", width: tableWidth * 0.1068, align: "right" as const },
    { header: "Annual Fee", width: tableWidth * 0.1198, align: "right" as const },
    { header: "Extra Chg", width: tableWidth * 0.1085, align: "right" as const },
    { header: "Deposits", width: tableWidth * 0.1000, align: "right" as const },
    { header: "Credit", width: tableWidth * 0.0810, align: "right" as const },
    { header: "Balance Due", width: tableWidth * 0.1244, align: "right" as const },
  ];

  const rowHeight = 18;
  const headerHeight = 22;

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
      const tx =
        col.align === "right"
          ? x + col.width - 4
          : col.align === "center"
            ? x + col.width / 2
            : x + 4;
      doc.text(col.header, tx, currentY + 12, { align: col.align });
      x += col.width;
    }
    currentY += headerHeight;
  }

  drawTableHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  // Sort by last name
  const sorted = [...rows].sort((a, b) => a.lastName.localeCompare(b.lastName));

  let totalBase = 0;
  let totalExtras = 0;
  let totalDeposits = 0;
  let totalCredits = 0;
  let totalBalance = 0;

  for (let rowIdx = 0; rowIdx < sorted.length; rowIdx++) {
    const r = sorted[rowIdx];

    // Page break check (leave ~50pt for the totals row + footer)
    if (currentY + rowHeight > pageHeight - 60) {
      doc.addPage();
      drawPageHeader();
      currentY = 90;
      drawTableHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    }

    if (rowIdx % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
    }
    doc.setDrawColor(220, 220, 220);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

    const contractLabel =
      r.contractedFrequency === "0"
        ? "Sub"
        : r.contractedFrequency === "2+"
          ? "2+/wk"
          : r.contractedFrequency === "2"
            ? "2/wk"
            : "1/wk";

    const cells: { value: string; align: "left" | "right" | "center"; bold?: boolean; color?: [number, number, number] }[] = [
      {
        value: `${r.lastName}, ${r.firstName}${r.noCharge ? " *" : ""}`,
        align: "left",
      },
      { value: contractLabel, align: "center" },
      { value: String(r.scheduledGames), align: "right" },
      {
        value:
          r.contractedFrequency === "2+" || r.contractedFrequency === "0"
            ? String(r.extraGames)
            : "—",
        align: "right",
      },
      { value: r.base ? fmt$(r.base) : "—", align: "right" },
      { value: r.extras ? fmt$(r.extras) : "—", align: "right" },
      { value: fmt$(r.deposits), align: "right" },
      { value: r.credit ? fmt$(r.credit) : "—", align: "right" },
      {
        value: r.balance < 0 ? `(${fmt$(-r.balance)})` : fmt$(r.balance),
        align: "right",
        bold: r.balance > 0,
        color: r.balance < 0 ? [0, 130, 0] : r.balance > 0 ? [180, 0, 0] : undefined,
      },
    ];

    let x = marginLeft;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const cell = cells[i];
      doc.setFont("helvetica", cell.bold ? "bold" : "normal");
      if (cell.color) doc.setTextColor(...cell.color);
      else doc.setTextColor(0, 0, 0);
      const tx =
        cell.align === "right"
          ? x + col.width - 4
          : cell.align === "center"
            ? x + col.width / 2
            : x + 4;
      doc.text(cell.value, tx, currentY + 11, { align: cell.align });
      x += col.width;
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    currentY += rowHeight;

    totalBase += r.base;
    totalExtras += r.extras;
    totalDeposits += r.deposits;
    totalCredits += r.credit ?? 0;
    totalBalance += r.balance;
  }

  // Totals row (bold, with top double-rule emphasis)
  if (currentY + rowHeight > pageHeight - 60) {
    doc.addPage();
    drawPageHeader();
    currentY = 90;
    drawTableHeader();
  }
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(1);
  doc.line(marginLeft, currentY - 1, marginLeft + tableWidth, currentY - 1);

  doc.setFillColor(230, 240, 250);
  doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
  doc.setDrawColor(200, 200, 200);
  doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);

  // Place totals under matching columns
  let x = marginLeft;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    let value = "";
    let align: "left" | "right" | "center" = col.align;
    if (i === 0) {
      value = `Totals (${sorted.length} player${sorted.length !== 1 ? "s" : ""})`;
      align = "left";
    } else if (i === 4) value = fmt$(totalBase);
    else if (i === 5) value = fmt$(totalExtras);
    else if (i === 6) value = fmt$(totalDeposits);
    else if (i === 7) value = fmt$(totalCredits);
    else if (i === 8) value = fmt$(totalBalance);
    if (value) {
      const tx =
        align === "right"
          ? x + col.width - 4
          : align === "center"
            ? x + col.width / 2
            : x + 4;
      doc.text(value, tx, currentY + 11, { align });
    }
    x += col.width;
  }
  currentY += rowHeight;
  doc.setFont("helvetica", "normal");

  // Footnote for the "*" marker — only when someone actually carries it.
  if (sorted.some((r) => r.noCharge)) {
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(
      "* No charge — this player is not billed a season fee or a per-game fee.",
      marginLeft,
      currentY + 12
    );
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    currentY += rowHeight;
  }

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const dayNames = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ];
  const dayName = dayNames[now.getDay()];
  const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const preparedText = `Prepared: ${dayName}, ${dateStr} ${timeStr}`;
  const footerY = pageHeight - 20;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text(preparedText, marginLeft, footerY);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginRight, footerY, {
      align: "right",
    });
    doc.setTextColor(0, 0, 0);
  }

  openPdfWithName(
    doc,
    `Accounts-Summary-${startYear}-${endYear}`,
    "Brooklake Don's Group Accounts Summary"
  );
}
