import jsPDF from "jspdf";

interface CompositionRow {
  compType: string;
  count: number;
  pct: number;
}

interface ACGame {
  date: string;
  gameNumber: number;
  players: string; // e.g. "Name (A), Name (C), ..."
}

interface CompositionData {
  seasonLabel: string;
  totalGames: number;
  compositions: CompositionRow[];
  acGames: ACGame[];
  acCount: number;
  acPct: number;
  playerCounts: { level: string; count: number }[];
}

export function generateCompositionPdf(data: CompositionData): void {
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
  const rowHeight = 18;
  const headerHeight = 22;

  // --- Page header ---
  function drawPageHeader() {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Game Composition Analysis — ${data.seasonLabel}`, pageWidth / 2, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Brooklake Tennis Club — Don's Group", pageWidth / 2, 58, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`${data.totalGames} completed games analyzed`, pageWidth / 2, 72, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  drawPageHeader();
  let currentY = 92;

  // === SECTION 1: Player counts by level ===
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Player Pool by Skill Level", marginLeft, currentY);
  currentY += 8;

  const levelCols = [
    { header: "Level", width: tableWidth * 0.5 },
    { header: "Players", width: tableWidth * 0.5 },
  ];

  // Header row
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(240, 240, 240);
  doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "F");
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "S");
  let lx = marginLeft;
  for (const col of levelCols) {
    doc.text(col.header, lx + 4, currentY + 12);
    lx += col.width;
  }
  currentY += headerHeight;

  doc.setFont("helvetica", "normal");
  let totalPlayers = 0;
  for (let i = 0; i < data.playerCounts.length; i++) {
    const pc = data.playerCounts[i];
    totalPlayers += pc.count;
    if (i % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
    }
    doc.setDrawColor(220, 220, 220);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");
    doc.text(pc.level, marginLeft + 4, currentY + 11);
    doc.text(String(pc.count), marginLeft + levelCols[0].width + 4, currentY + 11);
    currentY += rowHeight;
  }

  // Total row
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(1);
  doc.line(marginLeft, currentY - 2, marginLeft + tableWidth, currentY - 2);
  doc.setFillColor(230, 230, 230);
  doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");
  doc.setFont("helvetica", "bold");
  doc.text("Total", marginLeft + 4, currentY + 11);
  doc.text(String(totalPlayers), marginLeft + levelCols[0].width + 4, currentY + 11);
  currentY += rowHeight + 20;

  // === SECTION 2: Composition breakdown ===
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Composition Breakdown", marginLeft, currentY);
  currentY += 8;

  const compCols = [
    { header: "Composition", width: tableWidth * 0.35 },
    { header: "Games", width: tableWidth * 0.25 },
    { header: "% of Total", width: tableWidth * 0.40 },
  ];

  // Header
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(240, 240, 240);
  doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "F");
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "S");
  let cx = marginLeft;
  for (const col of compCols) {
    doc.text(col.header, cx + 4, currentY + 12);
    cx += col.width;
  }
  currentY += headerHeight;

  // Data rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (let i = 0; i < data.compositions.length; i++) {
    const row = data.compositions[i];
    if (currentY + rowHeight > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = 92;
    }
    if (i % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
    }
    doc.setDrawColor(220, 220, 220);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

    // Format composition nicely: AAAB → A-A-A-B
    const formatted = row.compType.split("").join("-");
    doc.text(formatted, marginLeft + 4, currentY + 11);
    doc.text(String(row.count), marginLeft + compCols[0].width + 4, currentY + 11);

    // Draw a small bar chart for percentage
    const barX = marginLeft + compCols[0].width + compCols[1].width + 4;
    const barMaxWidth = compCols[2].width - 40;
    const barWidth = (row.pct / 100) * barMaxWidth;
    doc.setFillColor(66, 133, 244);
    doc.rect(barX, currentY + 2, barWidth, 10, "F");
    doc.text(`${row.pct}%`, barX + barMaxWidth + 4, currentY + 11);

    currentY += rowHeight;
  }

  // Total row
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(1);
  doc.line(marginLeft, currentY - 2, marginLeft + tableWidth, currentY - 2);
  doc.setFillColor(230, 230, 230);
  doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");
  doc.setFont("helvetica", "bold");
  doc.text("Total", marginLeft + 4, currentY + 11);
  doc.text(String(data.totalGames), marginLeft + compCols[0].width + 4, currentY + 11);
  doc.text("100%", marginLeft + compCols[0].width + compCols[1].width + 4 + (compCols[2].width - 40) + 4, currentY + 11);
  currentY += rowHeight + 20;

  // === SECTION 3: A+C summary ===
  if (currentY + 40 > pageHeight - 40) {
    doc.addPage();
    drawPageHeader();
    currentY = 92;
  }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("A + C Combination Summary", marginLeft, currentY);
  currentY += 16;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Games with A+C players: ${data.acCount} of ${data.totalGames} (${data.acPct}%)`, marginLeft, currentY);
  currentY += 14;
  doc.text(`Games without A+C mix: ${data.totalGames - data.acCount} of ${data.totalGames} (${(100 - data.acPct).toFixed(1)}%)`, marginLeft, currentY);
  currentY += 24;

  // === SECTION 4: A+C game detail ===
  if (data.acGames.length > 0) {
    if (currentY + 50 > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = 92;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`A + C Game Detail (${data.acGames.length} games)`, marginLeft, currentY);
    currentY += 8;

    const detailCols = [
      { header: "Date", width: tableWidth * 0.15 },
      { header: "Game #", width: tableWidth * 0.10 },
      { header: "Players", width: tableWidth * 0.75 },
    ];

    // Header
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "S");
    let dx = marginLeft;
    for (const col of detailCols) {
      doc.text(col.header, dx + 4, currentY + 12);
      dx += col.width;
    }
    currentY += headerHeight;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (let i = 0; i < data.acGames.length; i++) {
      const game = data.acGames[i];
      if (currentY + rowHeight > pageHeight - 40) {
        doc.addPage();
        drawPageHeader();
        currentY = 92;

        // Redraw header
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setFillColor(240, 240, 240);
        doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "F");
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(marginLeft, currentY - 2, tableWidth, headerHeight, "S");
        let dx2 = marginLeft;
        for (const col of detailCols) {
          doc.text(col.header, dx2 + 4, currentY + 12);
          dx2 += col.width;
        }
        currentY += headerHeight;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
      }

      if (i % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
      }
      doc.setDrawColor(220, 220, 220);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

      // Format date as MM/DD
      const parts = game.date.split("-");
      const dateFormatted = `${parts[1]}/${parts[2]}`;

      doc.text(dateFormatted, marginLeft + 4, currentY + 11);
      doc.text(String(game.gameNumber), marginLeft + detailCols[0].width + 4, currentY + 11);

      // Truncate player text if too long
      const maxPlayerWidth = detailCols[2].width - 8;
      let playerText = game.players;
      while (doc.getTextWidth(playerText) > maxPlayerWidth && playerText.length > 10) {
        playerText = playerText.substring(0, playerText.length - 4) + "...";
      }
      doc.text(playerText, marginLeft + detailCols[0].width + detailCols[1].width + 4, currentY + 11);
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

  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, "_blank");
}
