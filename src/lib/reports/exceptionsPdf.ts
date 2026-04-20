import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";

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
  weekNumber: number;
  date: string;
  dayOfWeek: number;
  startTime: string;
  courtNumber: number;
  group: string;
  status: string;
  assignments: Assignment[];
}

interface Player {
  id: number;
  firstName: string;
  lastName: string;
}

interface Violation {
  rule: string;
  severity: "error" | "warning";
  gameId: number;
  gameNumber: number;
  date: string;
  playerName: string;
  detail: string;
}

interface Season {
  startDate: string;
  endDate: string;
}

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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function generateExceptionsPdf(
  games: Game[],
  players: Player[],
  violations: Violation[],
  season: Season,
  totalWeeks = 36
): void {
  const doc = new jsPDF({
    orientation: "landscape",
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

  const title = `Exception Report \u2014 Brooklake Don\u2019s Group ${startYear} - ${endYear}`;

  function drawPageHeader() {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 35, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Games with violations — ${totalWeeks} weeks`, pageWidth / 2, 50, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  drawPageHeader();

  const contentStartY = 62;
  let currentY = contentStartY;

  // Column layout
  const columns = [
    { header: "#", width: tableWidth * 0.04 },
    { header: "Wk", width: tableWidth * 0.035 },
    { header: "Date", width: tableWidth * 0.09 },
    { header: "Time", width: tableWidth * 0.06 },
    { header: "Ct", width: tableWidth * 0.03 },
    { header: "Player 1", width: tableWidth * 0.10 },
    { header: "Player 2", width: tableWidth * 0.10 },
    { header: "Player 3", width: tableWidth * 0.10 },
    { header: "Player 4", width: tableWidth * 0.10 },
    { header: "Exception", width: tableWidth * 0.285 },
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

  // Group violations by gameId
  const violationsByGame = new Map<number, Violation[]>();
  for (const v of violations) {
    const arr = violationsByGame.get(v.gameId) ?? [];
    arr.push(v);
    violationsByGame.set(v.gameId, arr);
  }

  // Filter and sort games that have violations
  const exceptionGames = games
    .filter((g) => violationsByGame.has(g.id))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.gameNumber - b.gameNumber;
    });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  for (let rowIdx = 0; rowIdx < exceptionGames.length; rowIdx++) {
    const game = exceptionGames[rowIdx];
    const gameViolations = violationsByGame.get(game.id) ?? [];

    // Build exception text
    // Deduplicate by combining player names for the same rule
    const ruleMap = new Map<string, { severity: string; details: string[] }>();
    for (const v of gameViolations) {
      const key = v.rule;
      const entry = ruleMap.get(key) ?? { severity: v.severity, details: [] };
      entry.details.push(v.detail);
      if (v.severity === "error") entry.severity = "error"; // escalate
      ruleMap.set(key, entry);
    }
    const exceptionParts: { text: string; severity: string }[] = [];
    for (const [, entry] of ruleMap) {
      // Use first detail as representative (they often differ per player)
      const uniqueDetails = [...new Set(entry.details)];
      exceptionParts.push({ text: uniqueDetails[0], severity: entry.severity });
      // If multiple unique details for same rule, add extras
      for (let i = 1; i < Math.min(uniqueDetails.length, 2); i++) {
        exceptionParts.push({ text: uniqueDetails[i], severity: entry.severity });
      }
    }

    // Calculate row height based on exception text wrapping
    const exceptionColWidth = columns[columns.length - 1].width - 6;
    const exceptionTexts = exceptionParts.map((p) => p.text);
    const joinedText = exceptionTexts.join("; ");
    const wrappedLines = doc.splitTextToSize(joinedText, exceptionColWidth);
    const textHeight = wrappedLines.length * 10;
    const thisRowHeight = Math.max(rowHeight, textHeight + 4);

    // Page break check
    if (currentY + thisRowHeight > pageHeight - 35) {
      doc.addPage();
      drawPageHeader();
      currentY = contentStartY;
      drawTableHeader();
    }

    // Alternating row background
    if (rowIdx % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(marginLeft, currentY - 2, tableWidth, thisRowHeight, "F");
    }

    // Row border
    doc.setDrawColor(220, 220, 220);
    doc.rect(marginLeft, currentY - 2, tableWidth, thisRowHeight, "S");

    // Get sorted assignments
    const sorted = [...game.assignments].sort((a, b) => a.slotPosition - b.slotPosition);
    const playerNames = [1, 2, 3, 4].map((slot) => {
      const a = sorted.find((x) => x.slotPosition === slot);
      return a ? getPlayerName(a.playerId, players) : "—";
    });

    const dow = game.dayOfWeek;
    const dayAbbr = DAYS[dow] ?? "";

    const values = [
      String(game.gameNumber),
      String(game.weekNumber),
      `${dayAbbr} ${formatDisplayDate(game.date)}`,
      game.startTime,
      String(game.courtNumber),
      playerNames[0],
      playerNames[1],
      playerNames[2],
      playerNames[3],
    ];

    // Draw data columns
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    let x = marginLeft;
    for (let i = 0; i < values.length; i++) {
      doc.text(values[i], x + 3, currentY + 9);
      x += columns[i].width;
    }

    // Draw exception text with color coding
    const hasError = exceptionParts.some((p) => p.severity === "error");
    if (hasError) {
      doc.setTextColor(180, 0, 0); // red for errors
    } else {
      doc.setTextColor(180, 120, 0); // amber for warnings
    }
    doc.setFontSize(7);
    doc.text(wrappedLines, x + 3, currentY + 9);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);

    currentY += thisRowHeight;
  }

  // Summary
  currentY += 10;
  if (currentY + 20 > pageHeight - 35) {
    doc.addPage();
    drawPageHeader();
    currentY = contentStartY;
  }
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warningCount = violations.filter((v) => v.severity === "warning").length;
  doc.text(
    `${exceptionGames.length} games with issues (${errorCount} errors, ${warningCount} warnings)`,
    marginLeft,
    currentY
  );

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[now.getDay()];
  const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const preparedText = `Prepared: ${dayName}, ${dateStr} ${timeStr}`;
  const footerY = pageHeight - 15;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text(preparedText, marginLeft, footerY);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginRight, footerY, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  openPdfWithName(
    doc,
    `Exceptions-${startYear}-${endYear}`,
    "Brooklake Don's Group Exceptions Report"
  );
}
