import jsPDF from "jspdf";

interface Assignment {
  id: number;
  gameId: number;
  playerId: number;
  slotPosition: number;
  isPrefill: boolean;
}

interface Game {
  id: number;
  gameNumber: number;
  seasonId: number;
  weekNumber: number;
  date: string;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  group: string;
  status: string;
  holidayName?: string;
  assignments: Assignment[];
}

interface Player {
  id: number;
  firstName: string;
  lastName: string;
}

interface Season {
  startDate: string;
  endDate: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getPlayerName(playerId: number, players: Player[]): string {
  const player = players.find((p) => p.id === playerId);
  if (!player) return "—";
  const sameLastName = players.filter(
    (p) => p.lastName === player.lastName && p.id !== player.id
  );
  if (sameLastName.length > 0) {
    return `${player.lastName}, ${player.firstName.charAt(0)}.`;
  }
  return player.lastName;
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}

// --- Compact report: 2 weeks per page ---

export function generateGamesByDatePdf(
  games: Game[],
  players: Player[],
  season: Season,
  weekStart: number,
  weekEnd: number
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  const pageWidth = doc.internal.pageSize.getWidth();   // 612
  const pageHeight = doc.internal.pageSize.getHeight();  // 792
  const marginLeft = 30;
  const marginRight = 30;
  const tableWidth = pageWidth - marginLeft - marginRight;

  const title = `Games By Date \u2014 Brooklake Don's Group ${startYear} - ${endYear}`;

  function drawPageHeader() {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 28, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Brooklake phone (973) 377-2235 x137   brooklaketennis.com", pageWidth / 2, 40, { align: "center" });
  }

  // Column layout: Game# | Time | Ct | Group | Player1 🎾 | Player2 | Player3 | Player4
  const colWidths = [
    tableWidth * 0.06,  // #
    tableWidth * 0.07,  // Time
    tableWidth * 0.04,  // Ct
    tableWidth * 0.07,  // Group
    tableWidth * 0.19,  // Player 1 (*)
    tableWidth * 0.19,  // Player 2
    tableWidth * 0.19,  // Player 3
    tableWidth * 0.19,  // Player 4
  ];
  const colHeaders = ["Game", "Time", "Ct", "Group", "Player 1 (*)", "Player 2", "Player 3", "Player 4"];

  const rowHeight = 15;
  const dateHeaderHeight = 15;
  const tableHeaderHeight = 15;

  // Group games by week
  const gamesByWeek = new Map<number, Game[]>();
  for (const g of games) {
    const arr = gamesByWeek.get(g.weekNumber) ?? [];
    arr.push(g);
    gamesByWeek.set(g.weekNumber, arr);
  }

  // Sort games within each week: day → time → court
  for (const [, weekGames] of gamesByWeek) {
    weekGames.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.courtNumber - b.courtNumber;
    });
  }

  let currentY = 0;
  let weeksOnPage = 0;
  let isFirstPage = true;

  function startNewPage() {
    if (!isFirstPage) {
      doc.addPage();
    }
    isFirstPage = false;
    drawPageHeader();
    currentY = 48;
    weeksOnPage = 0;
  }

  function drawTableHeaderRow() {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, currentY, tableWidth, tableHeaderHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY, tableWidth, tableHeaderHeight, "S");

    let x = marginLeft;
    for (let i = 0; i < colHeaders.length; i++) {
      doc.text(colHeaders[i], x + 2, currentY + 11);
      x += colWidths[i];
    }
    currentY += tableHeaderHeight;
  }

  // Iterate weeks
  const weeks = Array.from(gamesByWeek.keys()).sort((a, b) => a - b)
    .filter((w) => w >= weekStart && w <= weekEnd);

  for (const weekNum of weeks) {
    const weekGames = gamesByWeek.get(weekNum)!;

    // Group by date
    const byDate = new Map<string, Game[]>();
    for (const g of weekGames) {
      const arr = byDate.get(g.date) ?? [];
      arr.push(g);
      byDate.set(g.date, arr);
    }
    const dates = Array.from(byDate.keys()).sort();

    // Estimate space needed for this week
    // Only 1 table header row per week (not per day), saves vertical space
    const estimatedHeight = dateHeaderHeight + tableHeaderHeight +
      weekGames.length * rowHeight + dates.length * dateHeaderHeight + 8;

    // Check if we need a new page (2 weeks per page)
    if (weeksOnPage >= 2 || (currentY > 0 && currentY + estimatedHeight > pageHeight - 40)) {
      startNewPage();
    } else if (currentY === 0) {
      startNewPage();
    }

    // Week header
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Week ${weekNum}`, marginLeft, currentY + 11);
    currentY += dateHeaderHeight;

    for (let dateIdx = 0; dateIdx < dates.length; dateIdx++) {
      const date = dates[dateIdx];
      const dateGames = byDate.get(date)!;
      const dow = dateGames[0].dayOfWeek;
      const isFirstDate = dateIdx === 0;

      // Check space for date header + (table header if first) + at least 1 row
      const neededForHeader = dateHeaderHeight + (isFirstDate ? tableHeaderHeight : 0) + rowHeight;
      if (currentY + neededForHeader > pageHeight - 40) {
        startNewPage();
        // Reprint week header on new page
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(`Week ${weekNum} (cont.)`, marginLeft, currentY + 11);
        currentY += dateHeaderHeight;
        // Always draw column header after a page break
        drawTableHeaderRow();
      }

      // Date subheader
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text(`${DAYS[dow]} \u2014 ${formatDisplayDate(date)}`, marginLeft + 2, currentY + 10);
      doc.setTextColor(0, 0, 0);
      currentY += dateHeaderHeight - 2;

      // Column header row only for the first date of the week (Monday covers the rest)
      if (isFirstDate) {
        drawTableHeaderRow();
      }

      // Game rows
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      for (let rowIdx = 0; rowIdx < dateGames.length; rowIdx++) {
        const game = dateGames[rowIdx];

        // Page break check
        if (currentY + rowHeight > pageHeight - 40) {
          startNewPage();
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text(`Week ${weekNum} (cont.)`, marginLeft, currentY + 11);
          currentY += dateHeaderHeight;
          drawTableHeaderRow();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
        }

        const isEarlyGame = game.startTime < "10:00";
        const isHoliday = game.status === "holiday";
        const isBlanked = game.status === "blanked";

        // Row background
        if (isHoliday) {
          doc.setFillColor(255, 248, 220);
          doc.rect(marginLeft, currentY, tableWidth, rowHeight, "F");
        } else if (isBlanked) {
          doc.setFillColor(240, 240, 240);
          doc.rect(marginLeft, currentY, tableWidth, rowHeight, "F");
        } else if (isEarlyGame) {
          doc.setFillColor(255, 255, 102);
          doc.rect(marginLeft, currentY, tableWidth, rowHeight, "F");
        } else if (rowIdx % 2 === 1) {
          doc.setFillColor(248, 248, 248);
          doc.rect(marginLeft, currentY, tableWidth, rowHeight, "F");
        }

        // Row border
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.rect(marginLeft, currentY, tableWidth, rowHeight, "S");

        // Set text color for early games
        if (isEarlyGame && !isHoliday && !isBlanked) {
          doc.setTextColor(80, 80, 0);
        } else {
          doc.setTextColor(0, 0, 0);
        }

        let x = marginLeft;
        const textY = currentY + 11;

        // Game #
        doc.text(String(game.gameNumber), x + 2, textY);
        x += colWidths[0];

        // Time
        doc.text(game.startTime, x + 2, textY);
        x += colWidths[1];

        // Court
        doc.text(String(game.courtNumber), x + 2, textY);
        x += colWidths[2];

        // Group
        doc.text(game.group === "solo" ? "Solo" : "Don's", x + 2, textY);
        x += colWidths[3];

        if (isHoliday) {
          doc.setTextColor(180, 130, 0);
          doc.setFont("helvetica", "bold");
          doc.text(game.holidayName || "Holiday", x + 2, textY);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(0, 0, 0);
        } else if (isBlanked) {
          doc.setTextColor(150, 150, 150);
          doc.text("Blanked", x + 2, textY);
          doc.setTextColor(0, 0, 0);
        } else {
          // Player slots 1-4
          for (let slot = 1; slot <= 4; slot++) {
            const assignment = game.assignments.find((a) => a.slotPosition === slot);
            const name = assignment ? getPlayerName(assignment.playerId, players) : "\u2014";
            doc.text(name, x + 2, textY);
            x += colWidths[3 + slot];
          }
        }

        // Reset text color
        doc.setTextColor(0, 0, 0);
        currentY += rowHeight;
      }

      currentY += 2; // Small gap between dates
    }

    currentY += 6; // Gap between weeks
    weeksOnPage++;
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
    doc.text("Player 1 brings new balls", pageWidth / 2, footerY, { align: "center" });
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginRight, footerY, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text("Free Clinic Mondays 12-1", pageWidth / 2, footerY + 10, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, "_blank");
}


// --- Worksheet report: 1 week per page with write-in space ---

export function generateGamesByDateWorksheetPdf(
  games: Game[],
  players: Player[],
  season: Season,
  weekStart: number,
  weekEnd: number
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 30;
  const marginRight = 30;
  const tableWidth = pageWidth - marginLeft - marginRight;

  const title = `Games By Date \u2014 Brooklake Don's Group ${startYear} - ${endYear}`;

  function drawPageHeader(weekNum: number) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 36, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Brooklake phone (973) 377-2235 x137   brooklaketennis.com", pageWidth / 2, 50, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Week ${weekNum}`, marginLeft, 70);
  }

  // Column layout — wider rows for write-in space
  const colWidths = [
    tableWidth * 0.06,  // #
    tableWidth * 0.07,  // Time
    tableWidth * 0.04,  // Ct
    tableWidth * 0.07,  // Group
    tableWidth * 0.19,  // Player 1 (*)
    tableWidth * 0.19,  // Player 2
    tableWidth * 0.19,  // Player 3
    tableWidth * 0.19,  // Player 4
  ];
  const colHeaders = ["Game", "Time", "Ct", "Group", "Player 1 (*)", "Player 2", "Player 3", "Player 4"];

  // Taller rows: assigned name at top, blank space below for handwriting
  const assignedRowHeight = 13;
  const writeInHeight = 14;
  const totalRowHeight = assignedRowHeight + writeInHeight;
  const dateHeaderHeight = 13;
  const tableHeaderHeight = 13;

  function drawTableHeaderRow() {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, currentY, tableWidth, tableHeaderHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY, tableWidth, tableHeaderHeight, "S");

    let x = marginLeft;
    for (let i = 0; i < colHeaders.length; i++) {
      doc.text(colHeaders[i], x + 2, currentY + 9);
      x += colWidths[i];
    }
    currentY += tableHeaderHeight;
  }

  // Group games by week
  const gamesByWeek = new Map<number, Game[]>();
  for (const g of games) {
    const arr = gamesByWeek.get(g.weekNumber) ?? [];
    arr.push(g);
    gamesByWeek.set(g.weekNumber, arr);
  }

  for (const [, weekGames] of gamesByWeek) {
    weekGames.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.courtNumber - b.courtNumber;
    });
  }

  let currentY = 0;
  let isFirstPage = true;

  const weeks = Array.from(gamesByWeek.keys()).sort((a, b) => a - b)
    .filter((w) => w >= weekStart && w <= weekEnd);

  for (const weekNum of weeks) {
    const weekGames = gamesByWeek.get(weekNum)!;

    // Always start each week on a new page
    if (!isFirstPage) {
      doc.addPage();
    }
    isFirstPage = false;
    drawPageHeader(weekNum);
    currentY = 74;

    // Group by date
    const byDate = new Map<string, Game[]>();
    for (const g of weekGames) {
      const arr = byDate.get(g.date) ?? [];
      arr.push(g);
      byDate.set(g.date, arr);
    }
    const dates = Array.from(byDate.keys()).sort();

    for (const date of dates) {
      const dateGames = byDate.get(date)!;
      const dow = dateGames[0].dayOfWeek;

      // Check space
      if (currentY + dateHeaderHeight + tableHeaderHeight + totalRowHeight > pageHeight - 40) {
        doc.addPage();
        drawPageHeader(weekNum);
        currentY = 74;
      }

      // Date subheader
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text(`${DAYS[dow]} \u2014 ${formatDisplayDate(date)}`, marginLeft + 2, currentY + 9);
      doc.setTextColor(0, 0, 0);
      currentY += dateHeaderHeight;

      drawTableHeaderRow();

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);

      for (let rowIdx = 0; rowIdx < dateGames.length; rowIdx++) {
        const game = dateGames[rowIdx];

        // Page break check
        if (currentY + totalRowHeight > pageHeight - 40) {
          doc.addPage();
          drawPageHeader(weekNum);
          currentY = 80;
          drawTableHeaderRow();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
        }

        const isEarlyGame = game.startTime < "10:00";
        const isHoliday = game.status === "holiday";
        const isBlanked = game.status === "blanked";

        const effectiveRowHeight = (isHoliday || isBlanked) ? assignedRowHeight : totalRowHeight;

        // Row background
        if (isHoliday) {
          doc.setFillColor(255, 248, 220);
          doc.rect(marginLeft, currentY, tableWidth, effectiveRowHeight, "F");
        } else if (isBlanked) {
          doc.setFillColor(240, 240, 240);
          doc.rect(marginLeft, currentY, tableWidth, effectiveRowHeight, "F");
        } else if (isEarlyGame) {
          doc.setFillColor(255, 255, 102);
          doc.rect(marginLeft, currentY, tableWidth, effectiveRowHeight, "F");
        } else if (rowIdx % 2 === 1) {
          doc.setFillColor(248, 248, 248);
          doc.rect(marginLeft, currentY, tableWidth, effectiveRowHeight, "F");
        }

        // Full row border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(marginLeft, currentY, tableWidth, effectiveRowHeight, "S");

        // For normal games, draw a dashed line separating assigned name from write-in area
        if (!isHoliday && !isBlanked) {
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          // Dashed separator between name row and write-in row
          const separatorY = currentY + assignedRowHeight;
          const dashLength = 3;
          const gapLength = 3;
          // Only draw dashes across the player columns (skip game info columns)
          const playerStartX = marginLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3];
          for (let dx = playerStartX; dx < marginLeft + tableWidth; dx += dashLength + gapLength) {
            const endX = Math.min(dx + dashLength, marginLeft + tableWidth);
            doc.line(dx, separatorY, endX, separatorY);
          }
        }

        // Text color for early games
        if (isEarlyGame && !isHoliday && !isBlanked) {
          doc.setTextColor(80, 80, 0);
        } else {
          doc.setTextColor(0, 0, 0);
        }

        let x = marginLeft;

        // Game #
        doc.text(String(game.gameNumber), x + 2, currentY + 9);
        x += colWidths[0];

        // Time
        doc.text(game.startTime, x + 2, currentY + 9);
        x += colWidths[1];

        // Court
        doc.text(String(game.courtNumber), x + 2, currentY + 9);
        x += colWidths[2];

        // Group
        doc.text(game.group === "solo" ? "Solo" : "Don's", x + 2, currentY + 9);
        x += colWidths[3];

        if (isHoliday) {
          doc.setTextColor(180, 130, 0);
          doc.setFont("helvetica", "bold");
          doc.text(game.holidayName || "Holiday", x + 2, currentY + 9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(0, 0, 0);
        } else if (isBlanked) {
          doc.setTextColor(150, 150, 150);
          doc.text("Blanked", x + 2, currentY + 9);
          doc.setTextColor(0, 0, 0);
        } else {
          // Player slots 1-4
          for (let slot = 1; slot <= 4; slot++) {
            const assignment = game.assignments.find((a) => a.slotPosition === slot);
            const name = assignment ? getPlayerName(assignment.playerId, players) : "";
            doc.text(name, x + 2, currentY + 9);
            x += colWidths[3 + slot];
          }
        }

        doc.setTextColor(0, 0, 0);
        currentY += effectiveRowHeight;
      }

      currentY += 2;
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
    doc.text("Player 1 brings new balls", pageWidth / 2, footerY, { align: "center" });
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginRight, footerY, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text("Free Clinic Mondays 12-1", pageWidth / 2, footerY + 10, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, "_blank");
}
