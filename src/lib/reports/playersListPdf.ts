import jsPDF from "jspdf";
import { formatPhone } from "@/lib/formatPhone";

interface Player {
  firstName: string;
  lastName: string;
  cellNumber: string | null;
  homeNumber: string | null;
  email: string | null;
  contractedFrequency: string;
}

interface Season {
  startDate: string;
  endDate: string;
}

export function generatePlayersListPdf(
  players: Player[],
  season: Season
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);

  // Page dimensions
  const pageWidth = doc.internal.pageSize.getWidth(); // 612 for letter portrait
  const pageHeight = doc.internal.pageSize.getHeight(); // 792 for letter portrait
  const marginLeft = 40;
  const marginRight = 40;
  const tableWidth = pageWidth - marginLeft - marginRight;

  // --- Header helper (drawn on every page) ---
  const title = `Players List \u2014 Brooklake Don's Group ${startYear} - ${endYear}`;

  function drawPageHeader() {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Brooklake phone (973) 377-2235 x137   brooklaketennis.com", pageWidth / 2, 56, { align: "center" });
    doc.setFontSize(8);
    doc.text("Lisa: (862) 485-5582    Thu: (201) 563-7718", pageWidth / 2, 66, { align: "center" });
  }

  // Draw header on first page
  drawPageHeader();

  // One blank row reserved for future header content
  let currentY = 90;

  // --- Column layout ---
  const columns = [
    { header: "Last Name", width: tableWidth * 0.2 },
    { header: "First Name", width: tableWidth * 0.18 },
    { header: "Cell", width: tableWidth * 0.18 },
    { header: "Home Number", width: tableWidth * 0.18 },
    { header: "Email", width: tableWidth * 0.26 },
  ];

  const rowHeight = 18;
  const headerHeight = 22;

  // --- Helper: draw section header row ---
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

  // --- Helper: draw a section (Contract Players or Substitutes) ---
  function drawSection(sectionTitle: string, sectionPlayers: Player[]) {
    // Check if we need a page break for the section title + header + at least 1 row
    if (currentY + 50 > pageHeight - 40) {
      doc.addPage();
      drawPageHeader();
      currentY = 90;
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

    const sorted = [...sectionPlayers].sort((a, b) =>
      a.lastName.localeCompare(b.lastName)
    );

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

      let x = marginLeft;
      const values = [
        player.lastName,
        player.firstName,
        formatPhone(player.cellNumber),
        formatPhone(player.homeNumber),
        player.email ?? "",
      ];

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
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

  if (substitutes.length > 0) {
    drawSection(`Substitutes (${substitutes.length})`, substitutes);
  }

  // --- Footer on every page: date/time left, page X of Y right ---
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
