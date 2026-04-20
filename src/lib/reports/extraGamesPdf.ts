import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";

interface ExtraGameRow {
  playerName: string;
  gameNumber: number;
  date: string;
  dayOfWeek: number;
  players: string[]; // all 4 players in the game
}

interface Season {
  startDate: string;
  endDate: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function generateExtraGamesPdf(
  rows: ExtraGameRow[],
  season: Season,
  currentMaxWeek: number,
  totalWeeks = 36
): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "letter",
  });

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  const pageWidth = doc.internal.pageSize.getWidth(); // 792
  const pageHeight = doc.internal.pageSize.getHeight(); // 612
  const marginLeft = 30;
  const marginRight = 30;
  const tableWidth = pageWidth - marginLeft - marginRight;

  const title = `Extra Games \u2014 Brooklake Don's Group ${startYear} - ${endYear}`;

  function drawPageHeader() {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 36, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Brooklake phone (973) 377-2235 x137   brooklaketennis.com", pageWidth / 2, 52, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Through Week ${currentMaxWeek} of ${totalWeeks}`, pageWidth / 2, 64, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  drawPageHeader();

  let currentY = 78;

  // Column layout
  const columns = [
    { header: "Player", width: tableWidth * 0.14 },
    { header: "Game #", width: tableWidth * 0.07 },
    { header: "Date", width: tableWidth * 0.11 },
    { header: "Day", width: tableWidth * 0.09 },
    { header: "Player 1", width: tableWidth * 0.15 },
    { header: "Player 2", width: tableWidth * 0.15 },
    { header: "Player 3", width: tableWidth * 0.15 },
    { header: "Player 4", width: tableWidth * 0.14 },
  ];

  const rowHeight = 16;
  const headerHeight = 20;

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
      doc.text(col.header, x + 3, currentY + 11);
      x += col.width;
    }
    currentY += headerHeight;
  }

  drawTableHeader();

  // Group rows by player
  const playerGroups = new Map<string, ExtraGameRow[]>();
  for (const row of rows) {
    const existing = playerGroups.get(row.playerName) ?? [];
    existing.push(row);
    playerGroups.set(row.playerName, existing);
  }

  // Sort players alphabetically
  const sortedPlayers = Array.from(playerGroups.keys()).sort();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  let globalRowIdx = 0;

  for (const playerName of sortedPlayers) {
    const playerRows = playerGroups.get(playerName)!;

    // Sort games by date then game number
    playerRows.sort((a, b) => a.date.localeCompare(b.date) || a.gameNumber - b.gameNumber);

    for (let i = 0; i < playerRows.length; i++) {
      const row = playerRows[i];

      // Page break check
      if (currentY + rowHeight > pageHeight - 36) {
        doc.addPage();
        drawPageHeader();
        currentY = 78;
        drawTableHeader();
      }

      // Alternating row background
      if (globalRowIdx % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
      }

      // Row border
      doc.setDrawColor(220, 220, 220);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

      const [year, month, day] = row.date.split("-");
      const dateDisplay = `${month}/${day}/${year}`;

      const values = [
        i === 0 ? playerName : "", // Only show player name on first row of group
        String(row.gameNumber),
        dateDisplay,
        DAYS[row.dayOfWeek],
        row.players[0] ?? "—",
        row.players[1] ?? "—",
        row.players[2] ?? "—",
        row.players[3] ?? "—",
      ];

      // Player name in bold on first row
      let x = marginLeft;
      for (let c = 0; c < columns.length; c++) {
        if (c === 0 && i === 0) {
          doc.setFont("helvetica", "bold");
        } else {
          doc.setFont("helvetica", "normal");
        }
        doc.setFontSize(8);
        doc.text(values[c], x + 3, currentY + 10);
        x += columns[c].width;
      }

      currentY += rowHeight;
      globalRowIdx++;
    }

    // Separator line between player groups
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.75);
    doc.line(marginLeft, currentY - 2, marginLeft + tableWidth, currentY - 2);
  }

  if (rows.length === 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("No extra games found.", pageWidth / 2, currentY + 20, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[now.getDay()];
  const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const preparedText = `Prepared: ${dayName}, ${dateStr} ${timeStr}`;
  const footerY = pageHeight - 16;

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
    `Extra-Games-${startYear}-${endYear}`,
    "Brooklake Don's Group Extra Games"
  );
}
