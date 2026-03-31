import jsPDF from "jspdf";

interface PlayerInfo {
  id: number;
  firstName: string;
  lastName: string;
  skillLevel: string;
  contractedFrequency?: string;
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

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  // Sort all players alphabetically
  const sortedPlayers = [...players].sort((a, b) =>
    a.lastName.localeCompare(b.lastName)
  );

  if (sortedPlayers.length === 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("No player data available.", pageWidth / 2, 80, { align: "center" });
    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, "_blank");
    return;
  }

  // Split into contract players and subs
  const contractPlayers = sortedPlayers.filter((p) => p.contractedFrequency !== "0");
  const subPlayers = sortedPlayers.filter((p) => p.contractedFrequency === "0");

  // Build lookup maps
  const pairCountMap = new Map<string, number>();
  for (const p of pairings) {
    const k = `${Math.min(p.player1Id, p.player2Id)}-${Math.max(p.player1Id, p.player2Id)}`;
    pairCountMap.set(k, p.count);
  }

  const dnpSet = new Set<string>();
  for (const d of doNotPairs) {
    const k = `${Math.min(d.playerId, d.pairedPlayerId)}-${Math.max(d.playerId, d.pairedPlayerId)}`;
    dnpSet.add(k);
  }

  // Duplicate last name detection across ALL players
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

  function getCellColor(count: number): [number, number, number] {
    if (count <= 0) return [255, 255, 255];
    if (count <= 5) return [220, 245, 220];
    if (count <= 10) return [170, 220, 170];
    if (count <= 15) return [255, 245, 180];
    if (count <= 20) return [255, 210, 140];
    if (count <= 25) return [255, 170, 130];
    return [255, 140, 140];
  }

  // --- Draw a matrix page ---
  // colPlayers = all players (columns/top header)
  // rowPlayers = subset of players (rows/left header)
  function drawMatrixPage(
    colPlayers: PlayerInfo[],
    rowPlayers: PlayerInfo[],
    subtitle: string,
    isFirstPage: boolean
  ) {
    if (!isFirstPage) doc.addPage();

    const marginLeft = 20;
    const marginRight = 10;
    const headerBottom = 22;
    const footerTop = pageHeight - 2;
    const headerRowNameHeight = 35;
    const rowHeaderWidth = 90;

    const NCols = colPlayers.length;
    const NRows = rowPlayers.length;

    // Title
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    const title = `Player Pairing Matrix \u2014 ${subtitle} ${startYear} - ${endYear}`;
    doc.text(title, pageWidth / 2, 14, { align: "center" });

    // Cell size based on available space
    const availableWidth = pageWidth - marginLeft - marginRight - rowHeaderWidth;
    const availableHeight = footerTop - headerBottom - headerRowNameHeight;
    const maxCellFromWidth = availableWidth / NCols;
    const maxCellFromHeight = availableHeight / NRows;
    const cellSize = Math.max(12, Math.min(maxCellFromWidth, maxCellFromHeight, 28));

    const cellFontSize = cellSize >= 20 ? 7 : cellSize >= 16 ? 6 : 5;
    const nameFontSize = cellSize >= 20 ? 7 : cellSize >= 16 ? 6 : 5;

    const gridX = marginLeft + rowHeaderWidth;
    const gridY = headerBottom + headerRowNameHeight;

    // Rotated column headers
    doc.setFontSize(nameFontSize);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    for (let col = 0; col < NCols; col++) {
      const name = getDisplayName(colPlayers[col]);
      const x = gridX + col * cellSize + cellSize / 2;
      const y = gridY - 4;
      doc.text(name, x, y, { angle: 55 });
    }

    // Row headers
    doc.setFontSize(nameFontSize);
    doc.setFont("helvetica", "normal");
    for (let row = 0; row < NRows; row++) {
      const name = getDisplayName(rowPlayers[row]);
      const y = gridY + row * cellSize + cellSize / 2 + cellFontSize / 3;
      doc.setTextColor(0, 0, 0);
      doc.text(name, gridX - 4, y, { align: "right" });
    }

    // Grid cells
    for (let row = 0; row < NRows; row++) {
      for (let col = 0; col < NCols; col++) {
        const x = gridX + col * cellSize;
        const y = gridY + row * cellSize;

        const rowPlayer = rowPlayers[row];
        const colPlayer = colPlayers[col];

        if (rowPlayer.id === colPlayer.id) {
          // Diagonal — gray
          doc.setFillColor(210, 210, 210);
          doc.rect(x, y, cellSize, cellSize, "F");
        } else {
          const p1 = rowPlayer.id;
          const p2 = colPlayer.id;
          const key = `${Math.min(p1, p2)}-${Math.max(p1, p2)}`;
          const count = pairCountMap.get(key) ?? 0;
          const isDnp = dnpSet.has(key);

          if (isDnp && count > 0) {
            doc.setFillColor(255, 130, 130);
            doc.rect(x, y, cellSize, cellSize, "F");
          } else if (isDnp && count === 0) {
            doc.setFillColor(255, 240, 240);
            doc.rect(x, y, cellSize, cellSize, "F");
          } else {
            const [cr, cg, cb] = getCellColor(count);
            doc.setFillColor(cr, cg, cb);
            doc.rect(x, y, cellSize, cellSize, "F");
          }

          if (count > 0) {
            doc.setFontSize(cellFontSize);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(isDnp ? 180 : 0, 0, 0);
            doc.text(String(count), x + cellSize / 2, y + cellSize / 2 + cellFontSize / 3, {
              align: "center",
            });
          }
        }

        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.rect(x, y, cellSize, cellSize, "S");
      }
    }
  }

  // Page 1: Contract players (rows) × All players (columns)
  drawMatrixPage(sortedPlayers, contractPlayers, `Contract Players (${contractPlayers.length})`, true);

  // Page 2: Subs (rows) × All players (columns) — only if there are subs
  if (subPlayers.length > 0) {
    drawMatrixPage(sortedPlayers, subPlayers, `Substitutes (${subPlayers.length})`, false);
  }

  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, "_blank");
}
