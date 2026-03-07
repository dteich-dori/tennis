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
  contractedFrequency: string;
  skillLevel: string;
  isActive: boolean;
}

interface Season {
  startDate: string;
  endDate: string;
}

function getPlayerName(playerId: number, players: Player[]): string {
  const player = players.find((p) => p.id === playerId);
  if (!player) return "\u2014";
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

/**
 * Generates a "Games By Player" PDF report.
 * Lists each active player's game assignments in a flat table sorted by date.
 * Players with no games are skipped.
 */
export function generateGamesByPlayerPdf(
  activePlayers: Player[],
  allPlayers: Player[],
  normalGames: Game[],
  season: Season
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
  const marginLeft = 40;
  const marginRight = 40;
  const tableWidth = pageWidth - marginLeft - marginRight; // 532

  const title = `Games By Player \u2014 Brooklake ${startYear} - ${endYear}`;

  const rowHeight = 18;
  const tableHeaderHeight = 22;
  const sectionHeaderHeight = 20;

  // Column layout: Game# | Date | Time | Ct | P1(*) | P2 | P3 | P4
  const colWidths = [
    tableWidth * 0.07,    // Game #
    tableWidth * 0.14,    // Date
    tableWidth * 0.09,    // Time
    tableWidth * 0.05,    // Ct
    tableWidth * 0.1625,  // Player 1 (*)
    tableWidth * 0.1625,  // Player 2
    tableWidth * 0.1625,  // Player 3
    tableWidth * 0.1625,  // Player 4
  ];
  const colHeaders = ["Game", "Date", "Time", "Ct", "Player 1 (*)", "Player 2", "Player 3", "Player 4"];

  // Build player → games map
  const playerGamesMap = new Map<number, Game[]>();
  for (const game of normalGames) {
    for (const a of game.assignments) {
      const arr = playerGamesMap.get(a.playerId) ?? [];
      arr.push(game);
      playerGamesMap.set(a.playerId, arr);
    }
  }

  // Sort games within each player: date → time → court
  for (const [, games] of playerGamesMap) {
    games.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.courtNumber - b.courtNumber;
    });
  }

  // Build sorted player list: only players with games, alphabetical by last name
  const playersWithGames = activePlayers
    .filter((p) => (playerGamesMap.get(p.id)?.length ?? 0) > 0)
    .sort((a, b) => {
      const cmp = a.lastName.localeCompare(b.lastName);
      if (cmp !== 0) return cmp;
      return a.firstName.localeCompare(b.firstName);
    });

  // --- Drawing helpers ---

  let currentY = 0;
  let isFirstPage = true;

  function drawPageHeader() {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 36, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Brooklake phone (973) 377-2235 x137   brooklaketennis.com", pageWidth / 2, 48, { align: "center" });
    doc.setFontSize(8);
    doc.text("Lisa: (862) 485-5582    Thu: (201) 563-7718", pageWidth / 2, 58, { align: "center" });
  }

  function startNewPage() {
    if (!isFirstPage) {
      doc.addPage();
    }
    isFirstPage = false;
    drawPageHeader();
    currentY = 68;
  }

  function drawTableHeaderRow() {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, currentY, tableWidth, tableHeaderHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY, tableWidth, tableHeaderHeight, "S");

    let x = marginLeft;
    for (let i = 0; i < colHeaders.length; i++) {
      doc.text(colHeaders[i], x + 4, currentY + 15);
      x += colWidths[i];
    }
    currentY += tableHeaderHeight;
  }

  // --- Render players ---

  for (const player of playersWithGames) {
    const games = playerGamesMap.get(player.id) ?? [];
    if (games.length === 0) continue;

    // Each player starts on a new page
    startNewPage();

    // Section header: "LastName, FirstName — Contract: X/wk | Games: N"
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    const playerFullName = `${player.lastName}, ${player.firstName}`;
    doc.text(playerFullName, marginLeft, currentY + 14);

    const nameWidth = doc.getTextWidth(playerFullName);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);

    const freq = player.contractedFrequency;
    const contractLabel = freq === "0" ? "Sub" : `Contract: ${freq}/wk`;
    const donsCount = games.filter((g) => g.group !== "solo").length;
    const soloCount = games.filter((g) => g.group === "solo").length;
    const infoText = ` \u2014 ${contractLabel} | Don's: ${donsCount} | Solo: ${soloCount}`;
    doc.text(infoText, marginLeft + nameWidth + 4, currentY + 14);
    doc.setTextColor(0, 0, 0);

    currentY += sectionHeaderHeight;

    // Table header
    drawTableHeaderRow();

    // Game rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    let rowIdx = 0;
    for (const game of games) {
      // Page break check
      if (currentY + rowHeight > pageHeight - 40) {
        startNewPage();

        // Continuation header
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(`${player.lastName}, ${player.firstName} (continued)`, marginLeft, currentY + 14);
        currentY += sectionHeaderHeight;

        drawTableHeaderRow();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        rowIdx = 0;
      }

      // Row background: pale yellow for early (before 10AM) games, alternating grey otherwise
      const isEarlyGame = game.startTime < "10:00";
      if (isEarlyGame) {
        doc.setFillColor(255, 255, 200);
        doc.rect(marginLeft, currentY, tableWidth, rowHeight, "F");
      } else if (rowIdx % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY, tableWidth, rowHeight, "F");
      }

      // Row border
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.rect(marginLeft, currentY, tableWidth, rowHeight, "S");

      doc.setTextColor(0, 0, 0);
      const textY = currentY + 13;
      let x = marginLeft;

      // Game #
      doc.text(String(game.gameNumber), x + 4, textY);
      x += colWidths[0];

      // Date
      doc.text(formatDisplayDate(game.date), x + 4, textY);
      x += colWidths[1];

      // Time
      doc.text(game.startTime, x + 4, textY);
      x += colWidths[2];

      // Court
      doc.text(String(game.courtNumber), x + 4, textY);
      x += colWidths[3];

      // Player slots 1-4
      for (let slot = 1; slot <= 4; slot++) {
        const assignment = game.assignments.find((a) => a.slotPosition === slot);
        const name = assignment ? getPlayerName(assignment.playerId, allPlayers) : "\u2014";
        doc.text(name, x + 4, textY);
        x += colWidths[3 + slot];
      }

      currentY += rowHeight;
      rowIdx++;
    }

    // Gap before next player
    currentY += 8;
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
