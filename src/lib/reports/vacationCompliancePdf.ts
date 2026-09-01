import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";
import { stampScheduleMark } from "./scheduleMark";

export interface VacationConflict {
  gameNumber: number;
  date: string;
  group: string;
  playerName: string;
  slotPosition: number;
  vacationStart: string;
  vacationEnd: string;
}

interface Season {
  startDate: string;
  endDate: string;
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function generateVacationCompliancePdf(
  conflicts: VacationConflict[],
  season: Season,
  checked: number,
  scheduleMark?: number
): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "letter",
  });
  stampScheduleMark(doc, scheduleMark);

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 30;
  const marginRight = 30;
  const tableWidth = pageWidth - marginLeft - marginRight;

  const title = `Vacation Compliance Report — ${startYear} - ${endYear}`;

  function drawPageHeader() {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 35, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    const subtitle = conflicts.length === 0
      ? `No vacation conflicts found (${checked} assignments checked)`
      : `${conflicts.length} conflict${conflicts.length !== 1 ? "s" : ""} found (${checked} assignments checked)`;
    doc.text(subtitle, pageWidth / 2, 50, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  drawPageHeader();

  if (conflicts.length === 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("All assignments are vacation-compliant.", pageWidth / 2, 90, { align: "center" });
    openPdfWithName(doc, `Vacation_Compliance_${startYear}-${endYear}.pdf`);
    return;
  }

  const contentStartY = 62;
  let currentY = contentStartY;

  const columns = [
    { header: "Game #", width: tableWidth * 0.08 },
    { header: "Date", width: tableWidth * 0.12 },
    { header: "Day", width: tableWidth * 0.06 },
    { header: "Group", width: tableWidth * 0.08 },
    { header: "Player", width: tableWidth * 0.20 },
    { header: "Slot", width: tableWidth * 0.06 },
    { header: "Vacation Period", width: tableWidth * 0.40 },
  ];

  const rowHeight = 16;
  const headerHeight = 18;

  function drawTableHeader() {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");

    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "S");

    let x = marginLeft;
    for (const col of columns) {
      doc.text(col.header, x + 3, currentY + 10);
      x += col.width;
    }
    currentY += headerHeight;
  }

  drawTableHeader();

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");

  for (let i = 0; i < conflicts.length; i++) {
    if (currentY + rowHeight > pageHeight - 30) {
      doc.addPage();
      currentY = 40;
      drawPageHeader();
      currentY = contentStartY;
      drawTableHeader();
    }

    const c = conflicts[i];
    const gameDate = new Date(c.date + "T12:00:00");
    const dayName = DAYS[gameDate.getDay()];

    if (i % 2 === 0) {
      doc.setFillColor(252, 235, 235);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
    }

    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, currentY + rowHeight - 2, marginLeft + tableWidth, currentY + rowHeight - 2);

    let x = marginLeft;
    const values = [
      `#${c.gameNumber}`,
      formatDisplayDate(c.date),
      dayName,
      c.group.charAt(0).toUpperCase() + c.group.slice(1),
      c.playerName,
      String(c.slotPosition),
      c.vacationStart === c.vacationEnd
        ? formatDisplayDate(c.vacationStart)
        : `${formatDisplayDate(c.vacationStart)} — ${formatDisplayDate(c.vacationEnd)}`,
    ];

    doc.setTextColor(180, 30, 30);
    for (let j = 0; j < values.length; j++) {
      doc.text(values[j], x + 3, currentY + 10);
      x += columns[j].width;
    }
    doc.setTextColor(0, 0, 0);

    currentY += rowHeight;
  }

  openPdfWithName(doc, `Vacation_Compliance_${startYear}-${endYear}.pdf`);
}
