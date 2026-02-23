import jsPDF from "jspdf";

interface PlayerStat {
  playerId: number;
  lastName: string;
  firstName: string;
  frequency: string;
  skillLevel: string;
  soloShareLevel: string | null;
  ytd: number;
  expectedYtd: number;
  deficit: number;
  ballsBrought: number;
  weeksPlayed: number;
}

interface Season {
  startDate: string;
  endDate: string;
}

export function generatePlayerStatsPdf(
  stats: PlayerStat[],
  season: Season,
  currentMaxWeek: number,
  group: "dons" | "solo",
  totalWeeks = 36
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  // Page dimensions
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 40;
  const marginRight = 40;
  const tableWidth = pageWidth - marginLeft - marginRight;

  // --- Header helper (drawn on every page) ---
  const groupLabel = group === "dons" ? "Don's Group" : "Solo Group";
  const title = `Player Statistics \u2014 Brooklake ${groupLabel} ${startYear} - ${endYear}`;

  function drawPageHeader() {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Brooklake phone (973) 377-2235 x137   brooklaketennis.com", pageWidth / 2, 58, { align: "center" });

    // Week info
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Through Week ${currentMaxWeek} of ${totalWeeks}`, pageWidth / 2, 72, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  // Draw header on first page
  drawPageHeader();

  let currentY = 88;

  // --- Column layout ---
  const columns = group === "dons"
    ? [
        { header: "Player", width: tableWidth * 0.35 },
        { header: "Contract", width: tableWidth * 0.15 },
        { header: "YTD", width: tableWidth * 0.15 },
        { header: "Extra", width: tableWidth * 0.15 },
        { header: "Ball Count", width: tableWidth * 0.20 },
      ]
    : [
        { header: "Player", width: tableWidth * 0.40 },
        { header: "Share", width: tableWidth * 0.20 },
        { header: "YTD", width: tableWidth * 0.20 },
        { header: "Ball Count", width: tableWidth * 0.20 },
      ];

  const rowHeight = 18;
  const headerHeight = 22;

  // --- Helper: draw table header row ---
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

  // --- Helper: draw a section ---
  function drawSection(sectionTitle: string, sectionStats: PlayerStat[]) {
    // Check if we need a page break for the section title + header + at least 1 row
    if (currentY + 50 > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = 88;
    }

    // Section title
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(sectionTitle, marginLeft, currentY);
    currentY += 8;

    // Table header
    drawTableHeader();

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    for (let rowIdx = 0; rowIdx < sectionStats.length; rowIdx++) {
      const stat = sectionStats[rowIdx];

      // Page break check
      if (currentY + rowHeight > pageHeight - 40) {
        doc.addPage();
        drawPageHeader();
        currentY = 88;
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

      const freq = parseInt(stat.frequency) || 0;

      // For solo group, show solo share level; for dons group, show contract frequency
      const contractValue = group === "solo"
        ? (stat.soloShareLevel ? stat.soloShareLevel.charAt(0).toUpperCase() + stat.soloShareLevel.slice(1) : "—")
        : (freq === 0 ? "Sub" : String(freq));

      const extra = Math.max(0, stat.ytd - (freq * currentMaxWeek));

      const values = group === "dons"
        ? [
            stat.lastName,
            contractValue,
            String(stat.ytd),
            extra > 0 ? String(extra) : "—",
            String(stat.ballsBrought),
          ]
        : [
            stat.lastName,
            contractValue,
            String(stat.ytd),
            String(stat.ballsBrought),
          ];

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      let x = marginLeft;
      for (let i = 0; i < columns.length; i++) {
        doc.text(values[i], x + 4, currentY + 11);
        x += columns[i].width;
      }
      currentY += rowHeight;
    }

    // --- Totals row ---
    if (currentY + rowHeight > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = 88;
      drawTableHeader();
    }

    const totalYtd = sectionStats.reduce((sum, s) => sum + s.ytd, 0);
    const totalBalls = sectionStats.reduce((sum, s) => sum + s.ballsBrought, 0);

    // Compute total for contract/share column
    let contractTotal = "";
    if (group === "solo") {
      const shareValues: Record<string, number> = { full: 1, half: 0.5, quarter: 0.25, eighth: 0.125 };
      const totalShare = sectionStats.reduce((sum, s) => {
        return sum + (s.soloShareLevel ? (shareValues[s.soloShareLevel] ?? 0) : 0);
      }, 0);
      contractTotal = String(totalShare % 1 === 0 ? totalShare : totalShare.toFixed(2));
    } else {
      const totalContracts = sectionStats.reduce((sum, s) => {
        return sum + (parseInt(s.frequency) || 0);
      }, 0);
      contractTotal = String(totalContracts);
    }

    const totalExtra = sectionStats.reduce((sum, s) => {
      const freq = parseInt(s.frequency) || 0;
      return sum + Math.max(0, s.ytd - (freq * currentMaxWeek));
    }, 0);

    // Line above totals row
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(1);
    doc.line(marginLeft, currentY - 2, marginLeft + tableWidth, currentY - 2);

    // Totals background
    doc.setFillColor(230, 230, 230);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const totalsValues = group === "dons"
      ? [
          "Total",
          contractTotal,
          String(totalYtd),
          totalExtra > 0 ? String(totalExtra) : "—",
          String(totalBalls),
        ]
      : [
          "Total",
          contractTotal,
          String(totalYtd),
          String(totalBalls),
        ];
    let tx = marginLeft;
    for (let i = 0; i < columns.length; i++) {
      doc.text(totalsValues[i], tx + 4, currentY + 11);
      tx += columns[i].width;
    }
    currentY += rowHeight;

    currentY += 20; // Gap before next section
  }

  // --- Split into groups ---
  const contractPlayers = stats.filter((s) => s.frequency !== "0");
  const substitutes = stats.filter((s) => s.frequency === "0");

  drawSection(`Contract Players (${contractPlayers.length})`, contractPlayers);

  if (substitutes.length > 0) {
    drawSection(`Substitutes (${substitutes.length})`, substitutes);
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

  // --- Open in new tab ---
  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, "_blank");
}
