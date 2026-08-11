import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";
import { stampScheduleMark } from "./scheduleMark";

interface Season {
  startDate: string;
  endDate: string;
}

interface BudgetParamsData {
  weeksPerSeason: number;
  gameDurationHours: number;
  costPerCourtPerHour: number;
  priceDons1: number;
  priceDons2: number;
  priceDons2plus: number;
  priceSubs: number;
  priceSolo: number;
  priceExtraHour: number;
  priceSoloSeason: number;
}

interface ComputedData {
  playerCounts: {
    dons0: number;
    dons1: number;
    dons1plus: number;
    dons2: number;
    dons2plus: number;
    solo: number;
  };
  extraGames2plus: number;
  extraGames1plus: number;
  subsGameCount: number;
  soloPlayers: { name: string; soloGames: number }[];
  donsCourtsPerWeek: number;
  soloCourtsPerWeek: number;
}

interface BudgetItem {
  id: number;
  category: string;
  name: string;
  amount: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Bookkeeping report — a printable snapshot of the Bookkeeping page:
 * Don's Income/Expenses/Net, Solo Income/Expenses/Net, and a Combined
 * Summary. Mirrors the derived-calculation formulas in
 * src/app/budget/page.tsx exactly (same income rows, same expense
 * formulas) so the PDF always matches what's on screen.
 */
export function generateBookkeepingPdf(
  season: Season,
  params: BudgetParamsData,
  computed: ComputedData,
  items: BudgetItem[],
  scheduleMark?: number
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
  const marginLeft = 40;
  const marginRight = 40;
  const tableWidth = pageWidth - marginLeft - marginRight;

  const title = `Bookkeeping — Brooklake ${startYear} - ${endYear}`;

  function drawPageHeader(): number {
    stampScheduleMark(doc, scheduleMark);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 40, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(
      `${params.weeksPerSeason} weeks/season · ${params.gameDurationHours}h/game · ${formatCurrency(params.costPerCourtPerHour)}/court-hr (season)`,
      pageWidth / 2,
      54,
      { align: "center" }
    );
    doc.setTextColor(0, 0, 0);
    return 74;
  }

  let currentY = drawPageHeader();

  function ensureSpace(need: number) {
    if (currentY + need > pageHeight - 50) {
      doc.addPage();
      currentY = drawPageHeader();
    }
  }

  function sectionTitle(text: string) {
    ensureSpace(24);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(text, marginLeft, currentY);
    currentY += 16;
  }

  // Generic table drawer: columns with fixed widths (last column right-aligned
  // amounts), header row shaded, body rows plain, optional bold total row.
  function drawTable(
    columns: { header: string; width: number; align?: "left" | "right" }[],
    rows: string[][],
    totalRow?: string[]
  ) {
    const rowHeight = 16;
    const headerHeight = 18;

    function drawHeaderRow() {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setFillColor(235, 235, 235);
      doc.rect(marginLeft, currentY, tableWidth, headerHeight, "F");
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(marginLeft, currentY, tableWidth, headerHeight, "S");
      let x = marginLeft;
      for (const col of columns) {
        const align = col.align ?? "left";
        doc.text(col.header, align === "right" ? x + col.width - 4 : x + 4, currentY + 13, {
          align: align === "right" ? "right" : "left",
        });
        x += col.width;
      }
      currentY += headerHeight;
    }

    ensureSpace(headerHeight + rowHeight);
    drawHeaderRow();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (let i = 0; i < rows.length; i++) {
      if (currentY + rowHeight > pageHeight - 50) {
        doc.addPage();
        currentY = drawPageHeader();
        drawHeaderRow();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
      }
      if (i % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marginLeft, currentY, tableWidth, rowHeight, "F");
      }
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.rect(marginLeft, currentY, tableWidth, rowHeight, "S");
      let x = marginLeft;
      doc.setTextColor(0, 0, 0);
      for (let c = 0; c < columns.length; c++) {
        const align = columns[c].align ?? "left";
        doc.text(rows[i][c] ?? "", align === "right" ? x + columns[c].width - 4 : x + 4, currentY + 11, {
          align: align === "right" ? "right" : "left",
        });
        x += columns[c].width;
      }
      currentY += rowHeight;
    }

    if (totalRow) {
      ensureSpace(rowHeight + 4);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.7);
      doc.line(marginLeft, currentY, marginLeft + tableWidth, currentY);
      currentY += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      let x = marginLeft;
      for (let c = 0; c < columns.length; c++) {
        const align = columns[c].align ?? "left";
        doc.text(totalRow[c] ?? "", align === "right" ? x + columns[c].width - 4 : x + 4, currentY + 11, {
          align: align === "right" ? "right" : "left",
        });
        x += columns[c].width;
      }
      currentY += rowHeight + 8;
    } else {
      currentY += 8;
    }
  }

  function summaryBox(
    label: string,
    income: number,
    expenses: number,
    net: number
  ) {
    ensureSpace(70);
    doc.setFillColor(248, 248, 248);
    doc.rect(marginLeft, currentY, tableWidth, 58, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY, tableWidth, 58, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(label, marginLeft + 10, currentY + 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text("Income", marginLeft + 10, currentY + 34);
    doc.text(formatCurrency(income), marginLeft + tableWidth - 10, currentY + 34, { align: "right" });
    doc.text("Expenses", marginLeft + 10, currentY + 47);
    doc.text(formatCurrency(expenses), marginLeft + tableWidth - 10, currentY + 47, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(marginLeft + tableWidth - 130, currentY + 52, marginLeft + tableWidth - 10, currentY + 52);
    doc.setTextColor(net >= 0 ? 20 : 200, net >= 0 ? 110 : 30, net >= 0 ? 60 : 30);
    doc.setFontSize(9.5);
    currentY += 58 + 14;
    doc.setTextColor(0, 0, 0);
  }

  // ===== Derived values (mirrors src/app/budget/page.tsx exactly) =====
  const extraGames2plus = computed.extraGames2plus;
  const extraGames1plus = computed.extraGames1plus;

  const donsIncomeRows: { label: string; qty: number; unit: string; price: number }[] = [
    { label: "1x/week", qty: computed.playerCounts.dons1, unit: "players", price: params.priceDons1 },
    { label: "1+/week", qty: computed.playerCounts.dons1plus, unit: "players", price: params.priceDons1 },
    { label: "1+ Extra Games", qty: extraGames1plus, unit: "games", price: params.priceSubs },
    { label: "2x/week", qty: computed.playerCounts.dons2, unit: "players", price: params.priceDons2 },
    { label: "2+/week", qty: computed.playerCounts.dons2plus, unit: "players", price: params.priceDons2plus },
    { label: "2+ Extra Games", qty: extraGames2plus, unit: "games", price: params.priceExtraHour },
    { label: "Subs", qty: computed.subsGameCount, unit: "games", price: params.priceSubs },
  ];
  const donsIncome = donsIncomeRows.reduce((s, r) => s + r.qty * r.price, 0);

  const soloPlayerList = computed.soloPlayers;
  const soloIncome = soloPlayerList.reduce((s, p) => s + p.soloGames * params.priceSolo, 0);

  const incomeItems = items.filter((i) => i.category === "income");
  const expenseItems = items.filter((i) => i.category === "expense");
  const manualIncome = incomeItems.reduce((s, i) => s + i.amount, 0);
  const manualExpense = expenseItems.reduce((s, i) => s + i.amount, 0);

  const donsCourtsPerWeek = computed.donsCourtsPerWeek;
  const soloCourtsPerWeek = computed.soloCourtsPerWeek;
  const donsCourtCost = donsCourtsPerWeek * params.gameDurationHours * params.costPerCourtPerHour;
  const soloCourtCost = soloCourtsPerWeek * params.gameDurationHours * params.costPerCourtPerHour;
  const clinicCost = params.costPerCourtPerHour * 1;

  const donsExpenseTotal = donsCourtCost + clinicCost + manualExpense;
  const donsIncomeTotal = donsIncome + manualIncome;
  const donsNet = donsIncomeTotal - donsExpenseTotal;

  const soloExpenseTotal = soloCourtCost;
  const soloIncomeTotal = soloIncome;
  const soloNet = soloIncomeTotal - soloExpenseTotal;

  const totalIncome = donsIncomeTotal + soloIncomeTotal;
  const totalExpenses = donsExpenseTotal + soloExpenseTotal;
  const net = totalIncome - totalExpenses;

  // ===== Don's Income =====
  sectionTitle("Don's Income");
  const incomeCols = [
    { header: "Item", width: tableWidth * 0.4 },
    { header: "Qty", width: tableWidth * 0.2, align: "right" as const },
    { header: "Price", width: tableWidth * 0.2, align: "right" as const },
    { header: "Revenue", width: tableWidth * 0.2, align: "right" as const },
  ];
  const incomeRows: string[][] = donsIncomeRows.map((r) => [
    r.label,
    `${r.qty} ${r.unit}`,
    r.price > 0 ? formatCurrency(r.price) : "—",
    r.price > 0 ? formatCurrency(r.qty * r.price) : "—",
  ]);
  for (const item of incomeItems) {
    incomeRows.push([item.name, "—", "—", formatCurrency(item.amount)]);
  }
  drawTable(incomeCols, incomeRows, ["Don's Income Total", "", "", formatCurrency(donsIncomeTotal)]);

  // ===== Don's Expenses =====
  sectionTitle("Don's Expenses");
  const expenseCols = [
    { header: "Item", width: tableWidth * 0.7 },
    { header: "Amount", width: tableWidth * 0.3, align: "right" as const },
  ];
  const donsExpenseRows: string[][] = [
    [`Court Rental (${donsCourtsPerWeek} courts/wk × ${params.gameDurationHours}h × ${formatCurrency(params.costPerCourtPerHour)})`, formatCurrency(donsCourtCost)],
    [`Clinic on Mondays (1h × ${formatCurrency(params.costPerCourtPerHour)}/hr)`, formatCurrency(clinicCost)],
  ];
  for (const item of expenseItems) {
    donsExpenseRows.push([item.name, formatCurrency(item.amount)]);
  }
  drawTable(expenseCols, donsExpenseRows, ["Don's Expenses Total", formatCurrency(donsExpenseTotal)]);

  // ===== Don's Summary =====
  summaryBox("Don's Summary", donsIncomeTotal, donsExpenseTotal, donsNet);

  // ===== Solo Income =====
  sectionTitle("Solo Income");
  const soloCols = [
    { header: "Player", width: tableWidth * 0.5 },
    { header: "Games", width: tableWidth * 0.2, align: "right" as const },
    { header: "Revenue", width: tableWidth * 0.3, align: "right" as const },
  ];
  const soloRows: string[][] = soloPlayerList.map((p) => [
    p.name,
    String(p.soloGames),
    formatCurrency(p.soloGames * params.priceSolo),
  ]);
  drawTable(
    soloCols,
    soloRows,
    [
      `Total (${soloPlayerList.length} players)`,
      String(soloPlayerList.reduce((s, p) => s + p.soloGames, 0)),
      formatCurrency(soloIncome),
    ]
  );

  // ===== Solo Expenses =====
  sectionTitle("Solo Expenses");
  const soloExpenseRows: string[][] = [
    [`Court Rental (${soloCourtsPerWeek} courts/wk × ${params.gameDurationHours}h × ${formatCurrency(params.costPerCourtPerHour)})`, formatCurrency(soloCourtCost)],
  ];
  drawTable(expenseCols, soloExpenseRows, ["Solo Expenses Total", formatCurrency(soloExpenseTotal)]);

  // ===== Solo Summary =====
  summaryBox("Solo Summary", soloIncomeTotal, soloExpenseTotal, soloNet);

  // ===== Combined Summary =====
  ensureSpace(90);
  doc.setFillColor(238, 238, 238);
  doc.rect(marginLeft, currentY, tableWidth, 78, "F");
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, currentY, tableWidth, 78, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text("Combined Summary", marginLeft + 10, currentY + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("Don's Net", marginLeft + 10, currentY + 38);
  doc.text(formatCurrency(donsNet), marginLeft + tableWidth - 10, currentY + 38, { align: "right" });
  doc.text("Solo Net", marginLeft + 10, currentY + 52);
  doc.text(formatCurrency(soloNet), marginLeft + tableWidth - 10, currentY + 52, { align: "right" });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(marginLeft + tableWidth - 150, currentY + 58, marginLeft + tableWidth - 10, currentY + 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Total Net", marginLeft + 10, currentY + 72);
  doc.text(formatCurrency(net), marginLeft + tableWidth - 10, currentY + 72, { align: "right" });
  currentY += 78 + 14;
  doc.setTextColor(0, 0, 0);

  // Footer with generation timestamp on every page
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(130, 130, 130);
    doc.text(`Generated ${dateStr}`, marginLeft, pageHeight - 20);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginRight, pageHeight - 20, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  openPdfWithName(doc, `Bookkeeping-${startYear}-${endYear}`, "Brooklake Bookkeeping");
}
