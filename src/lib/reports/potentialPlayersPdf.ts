import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Player {
  firstName: string;
  lastName: string;
  skillLevel: string;
  contractedFrequency: string;
  blockedDays: number[];
}

interface Season {
  startDate: string;
  endDate: string;
}

interface CourtSlot {
  dayOfWeek: number;
  isSolo: boolean;
}

export function generatePotentialPlayersPdf(
  players: Player[],
  season: Season,
  courtSlots: CourtSlot[]
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  // Page dimensions
  const pageWidth = doc.internal.pageSize.getWidth(); // 612
  const pageHeight = doc.internal.pageSize.getHeight(); // 792
  const marginLeft = 40;
  const marginRight = 40;
  const tableWidth = pageWidth - marginLeft - marginRight;

  const title = "Player List — Internal Report";

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

  let currentY = 90;

  // --- Column layout ---
  const columns = [
    { header: "Family Name", width: tableWidth * 0.24 },
    { header: "First Name", width: tableWidth * 0.20 },
    { header: "Level", width: tableWidth * 0.10 },
    { header: "Contract", width: tableWidth * 0.12 },
    { header: "Blocked Days", width: tableWidth * 0.34 },
  ];

  const rowHeight = 18;
  const headerHeight = 22;

  function drawTableHeader() {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");

    // Header background
    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "F");

    // Header border
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

  function formatContract(freq: string): string {
    switch (freq) {
      case "0":
        return "Sub";
      case "1":
        return "1";
      case "2":
        return "2";
      case "2+":
        return "2+";
      default:
        return freq;
    }
  }

  function formatBlockedDays(days: number[]): string {
    if (!days || days.length === 0) return "";
    const sorted = [...days].sort((a, b) => a - b);
    return sorted.map((d) => DAYS[d] ?? String(d)).join(", ");
  }

  function drawSection(sectionTitle: string, sectionPlayers: Player[]) {
    // Check for page break
    if (currentY + 50 > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = 90;
    }

    // Section title
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(sectionTitle, marginLeft, currentY);
    currentY += 8;

    // Table header
    drawTableHeader();

    // Sort by last name
    const sorted = [...sectionPlayers].sort((a, b) =>
      a.lastName.localeCompare(b.lastName)
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    for (let rowIdx = 0; rowIdx < sorted.length; rowIdx++) {
      const player = sorted[rowIdx];

      // Page break check
      if (currentY + rowHeight > pageHeight - 40) {
        doc.addPage();
        drawPageHeader();
        currentY = 90;
        drawTableHeader();
      }

      // Alternating row background
      if (rowIdx % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
      }

      // Row border
      doc.setDrawColor(220, 220, 220);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

      const values = [
        player.lastName,
        player.firstName,
        player.skillLevel,
        formatContract(player.contractedFrequency),
        formatBlockedDays(player.blockedDays),
      ];

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);

      let x = marginLeft;
      for (let i = 0; i < columns.length; i++) {
        doc.text(values[i], x + 4, currentY + 11);
        x += columns[i].width;
      }
      currentY += rowHeight;
    }

    currentY += 20; // Gap before next section
  }

  // --- Split into groups ---
  const contractPlayers = players.filter(
    (p) => p.contractedFrequency !== "0"
  );
  const substitutes = players.filter((p) => p.contractedFrequency === "0");

  drawSection(`Contract Players (${contractPlayers.length})`, contractPlayers);

  // --- Weekly slots under contract subtotal ---
  {
    const weeklySlots = contractPlayers.reduce((sum, p) => {
      const freq = p.contractedFrequency === "2+" ? 2 : parseInt(p.contractedFrequency) || 0;
      return sum + freq;
    }, 0);

    if (currentY + 20 > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = 90;
    }

    currentY -= 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Weekly slots under contract: ${weeklySlots}`, marginLeft, currentY);
    currentY += 20;
  }

  if (substitutes.length > 0) {
    drawSection(`Substitutes (${substitutes.length})`, substitutes);
  }

  // ========================================================
  // SUMMARY TABLES
  // ========================================================

  const levels = ["A", "B", "C"];
  // Playing days: Mon(1) through Fri(5) — exclude Sun(0) and Sat(6)
  const playingDays = [1, 2, 3, 4, 5];

  // Pre-compute non-solo court counts per day from court schedule
  const donsCourtsPerDay = new Map<number, number>();
  for (const day of playingDays) {
    const count = courtSlots.filter(
      (s) => s.dayOfWeek === day && !s.isSolo
    ).length;
    donsCourtsPerDay.set(day, count);
  }

  function getFreqNumber(freq: string): number {
    if (freq === "2+" || freq === "2") return 2;
    if (freq === "1") return 1;
    return 0; // subs
  }

  function isAvailable(player: Player, day: number): boolean {
    return !player.blockedDays || !player.blockedDays.includes(day);
  }

  // --- Generic helper to draw a small summary table ---
  function drawSummaryTable(
    tableTitle: string,
    colHeaders: string[],
    rows: { label: string; values: (string | number)[] }[],
    totalsRow?: { label: string; values: (string | number)[] }
  ) {
    const numCols = colHeaders.length;
    const labelWidth = 80;
    const dataColWidth = Math.min(
      60,
      (tableWidth - labelWidth) / (numCols - 1)
    );
    const actualTableWidth = labelWidth + dataColWidth * (numCols - 1);
    const summaryRowHeight = 18;
    const summaryHeaderHeight = 22;
    const neededHeight =
      summaryHeaderHeight +
      summaryRowHeight * rows.length +
      (totalsRow ? summaryRowHeight : 0) +
      50;

    // Page break if needed
    if (currentY + neededHeight > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = 90;
    }

    // Title
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(tableTitle, marginLeft, currentY);
    currentY += 8;

    // Header row
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, currentY - 2, actualTableWidth, summaryHeaderHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY - 2, actualTableWidth, summaryHeaderHeight, "S");

    // First column header (left-aligned)
    doc.text(colHeaders[0], marginLeft + 4, currentY + 12);
    // Remaining column headers (right-aligned within cell)
    for (let c = 1; c < numCols; c++) {
      const cx = marginLeft + labelWidth + dataColWidth * (c - 1);
      doc.text(colHeaders[c], cx + dataColWidth - 4, currentY + 12, {
        align: "right",
      });
    }
    currentY += summaryHeaderHeight;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];

      if (r % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY - 2, actualTableWidth, summaryRowHeight, "F");
      }
      doc.setDrawColor(220, 220, 220);
      doc.rect(marginLeft, currentY - 2, actualTableWidth, summaryRowHeight, "S");

      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(row.label, marginLeft + 4, currentY + 11);
      for (let c = 0; c < row.values.length; c++) {
        const cx = marginLeft + labelWidth + dataColWidth * c;
        doc.text(String(row.values[c]), cx + dataColWidth - 4, currentY + 11, {
          align: "right",
        });
      }
      currentY += summaryRowHeight;
    }

    // Totals row
    if (totalsRow) {
      doc.setFillColor(230, 240, 250);
      doc.rect(marginLeft, currentY - 2, actualTableWidth, summaryRowHeight, "F");
      doc.setDrawColor(200, 200, 200);
      doc.rect(marginLeft, currentY - 2, actualTableWidth, summaryRowHeight, "S");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(totalsRow.label, marginLeft + 4, currentY + 11);
      for (let c = 0; c < totalsRow.values.length; c++) {
        const cx = marginLeft + labelWidth + dataColWidth * c;
        doc.text(String(totalsRow.values[c]), cx + dataColWidth - 4, currentY + 11, {
          align: "right",
        });
      }
      currentY += summaryRowHeight;
    }

    currentY += 20;
  }

  // -------------------------------------------------------
  // TABLE 1: Player Count by Level
  // -------------------------------------------------------
  {
    const colHeaders = ["Level", "Players", "Subs", "Total"];
    const rows: { label: string; values: number[] }[] = [];
    let totalPlayers = 0;
    let totalSubs = 0;

    for (const lvl of levels) {
      const pCount = contractPlayers.filter((p) => p.skillLevel === lvl).length;
      const sCount = substitutes.filter((p) => p.skillLevel === lvl).length;
      totalPlayers += pCount;
      totalSubs += sCount;
      rows.push({ label: lvl, values: [pCount, sCount, pCount + sCount] });
    }

    drawSummaryTable(
      "Players by Level",
      colHeaders,
      rows,
      { label: "Total", values: [totalPlayers, totalSubs, totalPlayers + totalSubs] }
    );
  }

  // -------------------------------------------------------
  // TABLE 2: Availability by Day of Week
  // -------------------------------------------------------
  {
    const colHeaders = ["Day", "Courts", "Avail. Slots", "Players", "Subs", "Total"];
    const rows: { label: string; values: number[] }[] = [];
    let totCourts = 0;
    let totGames = 0;
    let totP = 0;
    let totS = 0;

    for (const day of playingDays) {
      const courts = donsCourtsPerDay.get(day) ?? 0;
      const availGames = courts * 4;
      const pAvail = contractPlayers.filter((p) => isAvailable(p, day)).length;
      const sAvail = substitutes.filter((p) => isAvailable(p, day)).length;
      rows.push({ label: DAYS[day], values: [courts, availGames, pAvail, sAvail, pAvail + sAvail] });
      totCourts += courts;
      totGames += availGames;
      totP += pAvail;
      totS += sAvail;
    }

    drawSummaryTable(
      "Availability by Day of Week",
      colHeaders,
      rows,
      { label: "Total", values: [totCourts, totGames, totP, totS, totP + totS] }
    );

    // Explanation text below the availability table
    const explanationLines = [
      "Courts: Number of Don\u2019s group courts scheduled for the day (excludes Solo courts).",
      "Avail. Slots: Courts \u00D7 4 \u2014 the total player slots available on that day.",
      "Players: Contract players not blocked on that day.",
      "Subs: Substitute players not blocked on that day.",
      "Total: Players + Subs available on that day.",
    ];

    if (currentY + explanationLines.length * 12 + 10 > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = 90;
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    for (const line of explanationLines) {
      doc.text(line, marginLeft, currentY);
      currentY += 11;
    }
    doc.setTextColor(0, 0, 0);
    currentY += 10;
  }

  // --- Footer on every page ---
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const dayNames = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ];
  const dayName = dayNames[now.getDay()];
  const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(
    now.getDate()
  ).padStart(2, "0")}/${now.getFullYear()}`;
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

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);
  openPdfWithName(
    doc,
    `Player-List-Internal-${startYear}-${endYear}`,
    "Brooklake Don's Group Player List (Internal)"
  );
}
