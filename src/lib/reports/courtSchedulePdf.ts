import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";

interface CourtSchedule {
  id: number;
  dayOfWeek: number;
  courtNumber: number;
  startTime: string;
  isSolo: boolean;
}

interface Season {
  startDate: string;
  endDate: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Format "HH:MM" (24h) to "h:MM AM/PM"
 */
function formatTime(time: string): string {
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${ampm}`;
}

export function generateCourtSchedulePdf(
  courts: CourtSchedule[],
  season: Season
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 40;
  const marginRight = 40;
  const tableWidth = pageWidth - marginLeft - marginRight;

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);
  const title = `Court Schedule \u2014 Brooklake ${startYear} - ${endYear}`;

  // --- Page header (every page) ---
  function drawPageHeader() {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Brooklake phone (973) 377-2235 x137   brooklaketennis.com",
      pageWidth / 2,
      58,
      { align: "center" }
    );
  }

  drawPageHeader();
  let currentY = 82;

  // --- Column layout ---
  const columns = [
    { header: "Time", width: tableWidth * 0.30 },
    { header: "Court", width: tableWidth * 0.25 },
    { header: "Group", width: tableWidth * 0.25 },
  ];

  const rowHeight = 18;
  const headerHeight = 22;
  const sectionGap = 12;

  // --- Table header ---
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

  // --- Group courts by day, sort within each day ---
  const dayGroups = new Map<number, CourtSchedule[]>();
  for (const c of courts) {
    const arr = dayGroups.get(c.dayOfWeek) ?? [];
    arr.push(c);
    dayGroups.set(c.dayOfWeek, arr);
  }

  // Sort days Mon(1) → Sat(6), then Sun(0) if present
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  const sortedDays = dayOrder.filter((d) => dayGroups.has(d));

  for (const dow of sortedDays) {
    const dayCourts = dayGroups.get(dow)!;
    // Sort by time, then court number
    dayCourts.sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.courtNumber - b.courtNumber;
    });

    // Check space for section header + table header + at least 1 row
    if (currentY + sectionGap + 20 + headerHeight + rowHeight > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = 82;
    }

    // Section header (day name)
    currentY += sectionGap;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(DAYS[dow], marginLeft, currentY);
    currentY += 8;

    // Table header
    drawTableHeader();

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    for (let rowIdx = 0; rowIdx < dayCourts.length; rowIdx++) {
      const court = dayCourts[rowIdx];

      // Page break check
      if (currentY + rowHeight > pageHeight - 40) {
        doc.addPage();
        drawPageHeader();
        currentY = 82;
        // Re-draw day header and table header after break
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`${DAYS[dow]} (continued)`, marginLeft, currentY);
        currentY += 8;
        drawTableHeader();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
      }

      // Alternating row background
      if (rowIdx % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
      }

      // Row border
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

      const values = [
        formatTime(court.startTime),
        String(court.courtNumber),
        court.isSolo ? "Solo" : "Dons",
      ];

      let x = marginLeft;
      for (let i = 0; i < columns.length; i++) {
        doc.text(values[i], x + 4, currentY + 11);
        x += columns[i].width;
      }
      currentY += rowHeight;
    }
  }

  // --- Footer on every page ---
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[now.getDay()];
  const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const preparedText = `Prepared: ${dayName}, ${dateStr} ${timeStr}`;
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
    `Court-Schedule-${startYear}-${endYear}`,
    "Brooklake Court Schedule"
  );
}
