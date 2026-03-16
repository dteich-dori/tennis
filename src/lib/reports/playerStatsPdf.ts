import jsPDF from "jspdf";

interface PlayerStat {
  playerId: number;
  lastName: string;
  firstName: string;
  frequency: string;
  skillLevel: string;
  soloGames: number | null;
  std: number;
  expectedStd: number;
  deficit: number;
  ballsBrought: number;
  weeksPlayed: number;
  wednesdayCount: number;
  vacationDays: number;
  vacationGameDays: number;
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
  totalWeeks = 36,
  incompleteGameCount = 0
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

    // STD legend + optional incomplete count on same line
    doc.setFontSize(8);
    if (group === "dons" && incompleteGameCount > 0) {
      const stdPart = "STD = Season Totals          ";
      const incompletePart = `Incomplete Games: ${incompleteGameCount}`;
      const totalWidth = doc.getTextWidth(stdPart + incompletePart);
      const startX = (pageWidth - totalWidth) / 2;
      doc.text(stdPart, startX, 84);
      doc.setTextColor(180, 0, 0);
      doc.text(incompletePart, startX + doc.getTextWidth(stdPart), 84);
      doc.setTextColor(100, 100, 100);
    } else {
      doc.text("STD = Season Totals", pageWidth / 2, 84, { align: "center" });
    }

    doc.setTextColor(0, 0, 0);
  }

  // Draw header on first page
  drawPageHeader();

  const contentStartY = 98;
  let currentY = contentStartY;

  // --- Column layout ---
  const columns = group === "dons"
    ? [
        { header: "Player", width: tableWidth * 0.26 },
        { header: "Contract", width: tableWidth * 0.11 },
        { header: "STD", width: tableWidth * 0.10 },
        { header: "Extra", width: tableWidth * 0.10 },
        { header: "Balls", width: tableWidth * 0.11 },
        { header: "Vac Days", width: tableWidth * 0.16 },
        { header: "Vac Games", width: tableWidth * 0.16 },
      ]
    : [
        { header: "Player", width: tableWidth * 0.34 },
        { header: "Share", width: tableWidth * 0.14 },
        { header: "STD", width: tableWidth * 0.14 },
        { header: "Tue", width: tableWidth * 0.12 },
        { header: "Wed", width: tableWidth * 0.12 },
        { header: "Ball Count", width: tableWidth * 0.14 },
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
      currentY = contentStartY;
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
        currentY = contentStartY;
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

      // For solo group, show soloGames target; for dons group, show contract frequency
      const contractValue = group === "solo"
        ? (stat.soloGames ? String(stat.soloGames) : "—")
        : (freq === 0 ? "Sub" : String(freq));

      const extra = Math.max(0, stat.std - (freq * Math.min(currentMaxWeek, 36)));

      const values = group === "dons"
        ? [
            stat.lastName,
            contractValue,
            String(stat.std),
            extra > 0 ? String(extra) : "—",
            String(stat.ballsBrought),
            stat.vacationDays > 0 ? String(stat.vacationDays) : "—",
            stat.vacationGameDays > 0 ? String(stat.vacationGameDays) : "—",
          ]
        : [
            stat.lastName,
            contractValue,
            String(stat.std),
            String(stat.std - stat.wednesdayCount),
            String(stat.wednesdayCount),
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
      currentY = contentStartY;
      drawTableHeader();
    }

    const totalStd = sectionStats.reduce((sum, s) => sum + s.std, 0);
    const totalBalls = sectionStats.reduce((sum, s) => sum + s.ballsBrought, 0);

    // Compute total for contract/share column
    let contractTotal = "";
    if (group === "solo") {
      const totalGames = sectionStats.reduce((sum, s) => sum + (s.soloGames ?? 0), 0);
      const totalShares = totalGames / 36;
      contractTotal = `${totalGames} (${totalShares % 1 === 0 ? totalShares : totalShares.toFixed(1)} shares)`;
    } else {
      const totalContracts = sectionStats.reduce((sum, s) => {
        return sum + (parseInt(s.frequency) || 0);
      }, 0);
      contractTotal = String(totalContracts);
    }

    const totalExtra = sectionStats.reduce((sum, s) => {
      const freq = parseInt(s.frequency) || 0;
      return sum + Math.max(0, s.std - (freq * Math.min(currentMaxWeek, 36)));
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
    const totalVacDays = sectionStats.reduce((sum, s) => sum + (s.vacationDays ?? 0), 0);
    const totalVacGameDays = sectionStats.reduce((sum, s) => sum + (s.vacationGameDays ?? 0), 0);

    const totalsValues = group === "dons"
      ? [
          "Total",
          contractTotal,
          String(totalStd),
          totalExtra > 0 ? String(totalExtra) : "—",
          String(totalBalls),
          totalVacDays > 0 ? String(totalVacDays) : "—",
          totalVacGameDays > 0 ? String(totalVacGameDays) : "—",
        ]
      : (() => {
          const totalWed = sectionStats.reduce((sum, s) => sum + s.wednesdayCount, 0);
          return [
            "Total",
            contractTotal,
            String(totalStd),
            String(totalStd - totalWed),
            String(totalWed),
            String(totalBalls),
          ];
        })();
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

  // --- Summary by Skill Level (Don's group only) ---
  if (group === "dons") {
    // Page break check for summary section
    if (currentY + 100 > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = contentStartY;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Summary by Skill Level", marginLeft, currentY);
    currentY += 8;

    // Count players by skill level for contract players
    const levelCounts: Record<string, { count: number; totalFreq: number; totalStd: number }> = {};
    for (const s of contractPlayers) {
      const level = s.skillLevel || "?";
      if (!levelCounts[level]) levelCounts[level] = { count: 0, totalFreq: 0, totalStd: 0 };
      levelCounts[level].count++;
      levelCounts[level].totalFreq += (s.frequency === "2+" ? 2 : (parseInt(s.frequency) || 0));
      levelCounts[level].totalStd += s.std;
    }

    // Sort levels: A, B, C
    const levelOrder = ["A", "B", "C"];
    const sortedLevels = Object.keys(levelCounts).sort((a, b) => {
      const ai = levelOrder.indexOf(a);
      const bi = levelOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Summary table columns
    const summCols = [
      { header: "Level", width: tableWidth * 0.25 },
      { header: "Players", width: tableWidth * 0.25 },
      { header: "Contracts", width: tableWidth * 0.25 },
      { header: "STD Games", width: tableWidth * 0.25 },
    ];

    // Summary header
    const summHeaderHeight = 22;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, currentY - 2, tableWidth, summHeaderHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY - 2, tableWidth, summHeaderHeight, "S");
    let sx = marginLeft;
    for (const col of summCols) {
      doc.text(col.header, sx + 4, currentY + 12);
      sx += col.width;
    }
    currentY += summHeaderHeight;

    // Summary rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    let grandCount = 0;
    let grandFreq = 0;
    let grandStd = 0;

    for (let ri = 0; ri < sortedLevels.length; ri++) {
      const level = sortedLevels[ri];
      const data = levelCounts[level];
      grandCount += data.count;
      grandFreq += data.totalFreq;
      grandStd += data.totalStd;

      if (ri % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
      }
      doc.setDrawColor(220, 220, 220);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

      const vals = [level, String(data.count), String(data.totalFreq), String(data.totalStd)];
      let rx = marginLeft;
      for (let ci = 0; ci < summCols.length; ci++) {
        doc.text(vals[ci], rx + 4, currentY + 11);
        rx += summCols[ci].width;
      }
      currentY += rowHeight;
    }

    // Add subs row if any
    if (substitutes.length > 0) {
      const subStd = substitutes.reduce((sum, s) => sum + s.std, 0);
      const ri = sortedLevels.length;
      if (ri % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
      }
      doc.setDrawColor(220, 220, 220);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

      const vals = ["Sub", String(substitutes.length), "—", String(subStd)];
      let rx = marginLeft;
      for (let ci = 0; ci < summCols.length; ci++) {
        doc.text(vals[ci], rx + 4, currentY + 11);
        rx += summCols[ci].width;
      }
      grandCount += substitutes.length;
      grandStd += subStd;
      currentY += rowHeight;
    }

    // Grand total row
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(1);
    doc.line(marginLeft, currentY - 2, marginLeft + tableWidth, currentY - 2);
    doc.setFillColor(230, 230, 230);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

    doc.setFont("helvetica", "bold");
    const totVals = ["Total", String(grandCount), String(grandFreq), String(grandStd)];
    let gtx = marginLeft;
    for (let ci = 0; ci < summCols.length; ci++) {
      doc.text(totVals[ci], gtx + 4, currentY + 11);
      gtx += summCols[ci].width;
    }
    currentY += rowHeight + 20;
  }

  // --- Summary by Contract Type (Don's group only) ---
  if (group === "dons") {
    // Page break check
    if (currentY + 100 > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = contentStartY;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Summary by Contract Type", marginLeft, currentY);
    currentY += 8;

    // Group players by contract type
    const typeCounts: Record<string, { count: number; totalStd: number; totalExpected: number; totalExtra: number; totalBalls: number }> = {};
    for (const s of contractPlayers) {
      const label = s.frequency === "2+" ? "2+" : `${parseInt(s.frequency) || 0}x`;
      if (!typeCounts[label]) typeCounts[label] = { count: 0, totalStd: 0, totalExpected: 0, totalExtra: 0, totalBalls: 0 };
      const freq = parseInt(s.frequency) || 0;
      const expected = freq * Math.min(currentMaxWeek, totalWeeks);
      const extra = Math.max(0, s.std - expected);
      typeCounts[label].count++;
      typeCounts[label].totalStd += s.std;
      typeCounts[label].totalExpected += expected;
      typeCounts[label].totalExtra += extra;
      typeCounts[label].totalBalls += s.ballsBrought;
    }

    const typeOrder = ["1x", "2x", "2+"];
    const sortedTypes = typeOrder.filter((k) => typeCounts[k]);

    // Table columns
    const typeCols = [
      { header: "Contract", width: tableWidth * 0.18 },
      { header: "Players", width: tableWidth * 0.14 },
      { header: "Expected", width: tableWidth * 0.18 },
      { header: "STD", width: tableWidth * 0.16 },
      { header: "Extra", width: tableWidth * 0.16 },
      { header: "Balls", width: tableWidth * 0.18 },
    ];

    // Header
    const typeHeaderHeight = 22;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, currentY - 2, tableWidth, typeHeaderHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY - 2, tableWidth, typeHeaderHeight, "S");
    let tcx = marginLeft;
    for (const col of typeCols) {
      doc.text(col.header, tcx + 4, currentY + 12);
      tcx += col.width;
    }
    currentY += typeHeaderHeight;

    // Rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    let tGrandCount = 0;
    let tGrandStd = 0;
    let tGrandExpected = 0;
    let tGrandExtra = 0;
    let tGrandBalls = 0;

    for (let ri = 0; ri < sortedTypes.length; ri++) {
      const typeKey = sortedTypes[ri];
      const data = typeCounts[typeKey];
      tGrandCount += data.count;
      tGrandStd += data.totalStd;
      tGrandExpected += data.totalExpected;
      tGrandExtra += data.totalExtra;
      tGrandBalls += data.totalBalls;

      if (ri % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
      }
      doc.setDrawColor(220, 220, 220);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

      const vals = [typeKey, String(data.count), String(data.totalExpected), String(data.totalStd), data.totalExtra > 0 ? String(data.totalExtra) : "\u2014", String(data.totalBalls)];
      let rx = marginLeft;
      for (let ci = 0; ci < typeCols.length; ci++) {
        doc.text(vals[ci], rx + 4, currentY + 11);
        rx += typeCols[ci].width;
      }
      currentY += rowHeight;
    }

    // Subs row
    if (substitutes.length > 0) {
      const subStd = substitutes.reduce((sum, s) => sum + s.std, 0);
      const subBalls = substitutes.reduce((sum, s) => sum + s.ballsBrought, 0);
      const ri = sortedTypes.length;
      if (ri % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
      }
      doc.setDrawColor(220, 220, 220);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

      const vals = ["Sub", String(substitutes.length), "\u2014", String(subStd), "\u2014", String(subBalls)];
      let rx = marginLeft;
      for (let ci = 0; ci < typeCols.length; ci++) {
        doc.text(vals[ci], rx + 4, currentY + 11);
        rx += typeCols[ci].width;
      }
      tGrandCount += substitutes.length;
      tGrandStd += subStd;
      tGrandBalls += subBalls;
      currentY += rowHeight;
    }

    // Grand total row
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(1);
    doc.line(marginLeft, currentY - 2, marginLeft + tableWidth, currentY - 2);
    doc.setFillColor(230, 230, 230);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

    doc.setFont("helvetica", "bold");
    const tTotVals = ["Total", String(tGrandCount), String(tGrandExpected), String(tGrandStd), tGrandExtra > 0 ? String(tGrandExtra) : "\u2014", String(tGrandBalls)];
    let ttx = marginLeft;
    for (let ci = 0; ci < typeCols.length; ci++) {
      doc.text(tTotVals[ci], ttx + 4, currentY + 11);
      ttx += typeCols[ci].width;
    }
    currentY += rowHeight + 20;
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
