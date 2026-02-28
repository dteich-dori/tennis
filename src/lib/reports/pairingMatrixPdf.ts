import jsPDF from "jspdf";

interface PlayerInfo {
  id: number;
  firstName: string;
  lastName: string;
  skillLevel: string;
}

interface Pairing {
  player1Id: number;
  player2Id: number;
  count: number;
}

interface DoNotPair {
  playerId: number;
  pairedPlayerId: number;
}

interface Season {
  startDate: string;
  endDate: string;
}

/**
 * Generate an N x N pairing matrix PDF for Don's group.
 * Rows and columns are player last names (sorted alphabetically).
 * Each cell shows the number of shared games.
 * DNP violations (count > 0 for a do-not-pair relationship) are highlighted in red.
 */
export function generatePairingMatrixPdf(
  players: PlayerInfo[],
  pairings: Pairing[],
  doNotPairs: DoNotPair[],
  season: Season
): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 792 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // 612 pt

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);
  const title = `Player Pairing Matrix \u2014 Brooklake Don's Group ${startYear} - ${endYear}`;

  // Sort players alphabetically by last name
  const sortedPlayers = [...players].sort((a, b) =>
    a.lastName.localeCompare(b.lastName)
  );
  const N = sortedPlayers.length;

  if (N === 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(title, pageWidth / 2, 40, { align: "center" });
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("No player data available.", pageWidth / 2, 80, {
      align: "center",
    });
    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, "_blank");
    return;
  }

  // Build lookup maps
  const pairCountMap = new Map<string, number>();
  for (const p of pairings) {
    const k1 = `${Math.min(p.player1Id, p.player2Id)}-${Math.max(p.player1Id, p.player2Id)}`;
    pairCountMap.set(k1, p.count);
  }

  const dnpSet = new Set<string>();
  for (const d of doNotPairs) {
    const k = `${Math.min(d.playerId, d.pairedPlayerId)}-${Math.max(d.playerId, d.pairedPlayerId)}`;
    dnpSet.add(k);
  }

  // Layout calculations
  const marginLeft = 30;
  const marginRight = 20;
  const headerBottom = 42; // title/subtitle ends here
  const footerTop = pageHeight - 25; // footer starts here
  const headerRowNameHeight = 45; // height reserved for rotated column names

  // Compute player name display
  // Check for duplicate last names
  const lastNameCounts = new Map<string, number>();
  for (const p of sortedPlayers) {
    lastNameCounts.set(p.lastName, (lastNameCounts.get(p.lastName) ?? 0) + 1);
  }

  const getDisplayName = (p: PlayerInfo): string => {
    if ((lastNameCounts.get(p.lastName) ?? 0) > 1) {
      return `${p.lastName}, ${p.firstName.charAt(0)}`;
    }
    return p.lastName;
  };

  // Calculate cell size to fit everything between header and footer
  const rowHeaderWidth = 90; // width for row labels
  const availableWidth = pageWidth - marginLeft - marginRight - rowHeaderWidth;
  const availableHeight = footerTop - headerBottom - headerRowNameHeight - 5;

  const maxCellFromWidth = availableWidth / N;
  const maxCellFromHeight = availableHeight / N;
  const cellSize = Math.max(14, Math.min(maxCellFromWidth, maxCellFromHeight, 28));

  // Font size based on cell size
  const cellFontSize = cellSize >= 20 ? 7 : cellSize >= 16 ? 6 : 5;
  const nameFontSize = cellSize >= 20 ? 7 : cellSize >= 16 ? 6 : 5;

  // Color bands by count range (groups of 5)
  // Light green → darker green → yellow → orange → red
  function getCellColor(count: number): [number, number, number] {
    if (count <= 0) return [255, 255, 255]; // white
    if (count <= 5) return [220, 245, 220]; // light green
    if (count <= 10) return [170, 220, 170]; // medium green
    if (count <= 15) return [255, 245, 180]; // light yellow
    if (count <= 20) return [255, 210, 140]; // orange
    if (count <= 25) return [255, 170, 130]; // dark orange / light red
    return [255, 140, 140]; // red for 26+
  }

  // --- Draw header ---
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(title, pageWidth / 2, 22, { align: "center" });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    "Brooklake (973) 377-2235 x137   brooklaketennis.com     |     Green (1-10)  Yellow (11-15)  Orange (16-20)  Red (21+)     DNP violation = bold red     Gray = self",
    pageWidth / 2,
    34,
    { align: "center" }
  );
  doc.setTextColor(0, 0, 0);

  // Grid origin — place grid as high as possible (right after header + column names)
  const gridX = marginLeft + rowHeaderWidth;
  const gridY = headerBottom + headerRowNameHeight;

  // --- Draw rotated column headers ---
  doc.setFontSize(nameFontSize);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  for (let col = 0; col < N; col++) {
    const name = getDisplayName(sortedPlayers[col]);
    const x = gridX + col * cellSize + cellSize / 2;
    const y = gridY - 4;

    // Use jsPDF text rotation (angle in degrees, null for default options)
    doc.text(name, x, y, { angle: 55 });
  }

  // --- Draw row headers ---
  doc.setFontSize(nameFontSize);
  doc.setFont("helvetica", "normal");
  for (let row = 0; row < N; row++) {
    const name = getDisplayName(sortedPlayers[row]);
    const y = gridY + row * cellSize + cellSize / 2 + cellFontSize / 3;
    doc.setTextColor(0, 0, 0);
    doc.text(name, gridX - 4, y, { align: "right" });
  }

  // --- Draw grid cells ---
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const x = gridX + col * cellSize;
      const y = gridY + row * cellSize;

      if (row === col) {
        // Diagonal — gray
        doc.setFillColor(210, 210, 210);
        doc.rect(x, y, cellSize, cellSize, "F");
      } else {
        const p1 = sortedPlayers[row].id;
        const p2 = sortedPlayers[col].id;
        const key = `${Math.min(p1, p2)}-${Math.max(p1, p2)}`;
        const count = pairCountMap.get(key) ?? 0;
        const isDnp = dnpSet.has(key);

        if (isDnp && count > 0) {
          // DNP violation — bold red
          doc.setFillColor(255, 130, 130);
          doc.rect(x, y, cellSize, cellSize, "F");
        } else if (isDnp && count === 0) {
          // DNP but no violation — light pink
          doc.setFillColor(255, 240, 240);
          doc.rect(x, y, cellSize, cellSize, "F");
        } else {
          // Color band based on count (green → yellow → orange → red)
          const [cr, cg, cb] = getCellColor(count);
          doc.setFillColor(cr, cg, cb);
          doc.rect(x, y, cellSize, cellSize, "F");
        }

        // Draw count text
        if (count > 0) {
          doc.setFontSize(cellFontSize);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(isDnp ? 180 : 0, 0, 0);
          const text = String(count);
          doc.text(text, x + cellSize / 2, y + cellSize / 2 + cellFontSize / 3, {
            align: "center",
          });
        }
      }

      // Cell border
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.rect(x, y, cellSize, cellSize, "S");
    }
  }

  // --- Footer ---
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayName = dayNames[now.getDay()];
  const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const preparedText = `Prepared: ${dayName}, ${dateStr} ${timeStr}`;
  const footerY = pageHeight - 12;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text(preparedText, marginLeft, footerY);
    doc.text(`${N} players  |  Page ${i} of ${totalPages}`, pageWidth - marginRight, footerY, {
      align: "right",
    });
    doc.setTextColor(0, 0, 0);
  }

  // --- Open in new tab ---
  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, "_blank");
}
