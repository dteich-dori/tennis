import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";
import { stampScheduleMark } from "./scheduleMark";
import { tennisDayNumbers } from "@/lib/playerAvailability";

interface Player {
  firstName: string;
  lastName: string;
  contractedFrequency: string;
  skillLevel: string;
  isActive: boolean;
  blockedDays: number[];
  vacations: { startDate: string; endDate: string }[];
  // Sub-only positive availability (empty/undefined = available any
  // date, the default for both contracted players and unrestricted
  // subs). See player_available_dates schema comment.
  availableDates?: { startDate: string; endDate: string }[];
  excludedFromAutoAssign?: boolean;
}

interface Season {
  startDate: string;
  endDate: string;
  daysPerWeek?: number;
}

/**
 * Player Availability report — one row per active player showing:
 *   - Name (Last, First)
 *   - Days of the tennis week they CAN play (tennis days NOT in their
 *     blocked-days list)
 *   - Vacation date ranges
 *
 * Layout: portrait, full-width table. Vacations wrap onto follow-up rows
 * when the player has many of them.
 */
export function generatePlayerAvailabilityPdf(
  players: Player[],
  season: Season,
  scheduleMark?: number
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });
  stampScheduleMark(doc, scheduleMark);

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);
  const daysPerWeek = season.daysPerWeek ?? 5;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 40;
  const marginRight = 40;
  const tableWidth = pageWidth - marginLeft - marginRight;

  const title = `Player Availability — Brooklake ${startYear}-${endYear}`;
  const subtitle = `Active players · ${daysPerWeek}-day tennis week`;

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function drawPageHeader(): number {
    stampScheduleMark(doc, scheduleMark);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(title, pageWidth / 2, 40, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, pageWidth / 2, 56, { align: "center" });
    doc.setTextColor(0, 0, 0);
    return 80;
  }

  function formatDate(yyyymmdd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
    if (!m) return yyyymmdd;
    return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
  }

  function formatDateRangeList(
    ranges: { startDate: string; endDate: string }[]
  ): string {
    const sorted = [...ranges].sort((a, b) =>
      a.startDate.localeCompare(b.startDate)
    );
    return sorted
      .map((v) =>
        v.startDate === v.endDate
          ? formatDate(v.startDate)
          : `${formatDate(v.startDate)} – ${formatDate(v.endDate)}`
      )
      .join(",  ");
  }

  // Combines vacations (when a player CAN'T play) with a sub's
  // availableDates (the only dates a restricted sub CAN play) into one
  // column. Most players will only ever have one of the two set.
  function formatAvailabilityText(p: Player): string {
    const parts: string[] = [];
    if (p.availableDates && p.availableDates.length > 0) {
      parts.push(`Only: ${formatDateRangeList(p.availableDates)}`);
    }
    if (p.vacations && p.vacations.length > 0) {
      parts.push(`Vac: ${formatDateRangeList(p.vacations)}`);
    }
    return parts.length > 0 ? parts.join("   ") : "—";
  }

  function availableDayLabels(blocked: number[]): string {
    const tennisDays = tennisDayNumbers(daysPerWeek);
    const blockedSet = new Set(blocked);
    const labels = tennisDays
      .filter((d) => !blockedSet.has(d))
      .map((d) => DAY_LABELS[d]);
    return labels.length > 0
      ? labels.join(", ")
      : "— (no days available)";
  }

  function contractLabelShort(freq: string): string {
    if (freq === "0") return "Sub";
    if (freq === "1+") return "1x+";
    if (freq === "2+") return "2x+";
    return `${freq}x`;
  }

  // Filter + sort: active, not-excluded players, alphabetical by lastName
  const active = players
    .filter((p) => p.isActive && !p.excludedFromAutoAssign)
    .sort((a, b) => {
      const c = a.lastName.localeCompare(b.lastName);
      return c !== 0 ? c : a.firstName.localeCompare(b.firstName);
    });

  // --- Column layout ---
  const columns = [
    { header: "Player", width: tableWidth * 0.22 },
    { header: "Contract", width: tableWidth * 0.08 },
    { header: "Skill", width: tableWidth * 0.06 },
    { header: "Days Can Play", width: tableWidth * 0.18 },
    { header: "Vacations / Sub Availability", width: tableWidth * 0.46 },
  ];

  const rowMinHeight = 18;
  const headerHeight = 22;

  function drawTableHeader(y: number): number {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setFillColor(235, 235, 235);
    doc.rect(marginLeft, y - 2, tableWidth, headerHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, y - 2, tableWidth, headerHeight, "S");
    let x = marginLeft;
    for (const col of columns) {
      doc.text(col.header, x + 4, y + 13);
      x += col.width;
    }
    return y + headerHeight;
  }

  let currentY = drawPageHeader();
  currentY = drawTableHeader(currentY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  // --- Helper: split a long string into multiple lines that fit the column ---
  function wrapText(text: string, maxWidth: number): string[] {
    if (!text) return [""];
    const lines: string[] = [];
    const words = text.split(/(\s+|, )/);
    let cur = "";
    for (const w of words) {
      const trial = cur + w;
      if (doc.getTextWidth(trial) <= maxWidth) {
        cur = trial;
      } else {
        if (cur.trim().length > 0) lines.push(cur.trimEnd());
        cur = w.trimStart();
      }
    }
    if (cur.trim().length > 0) lines.push(cur.trimEnd());
    return lines.length > 0 ? lines : [""];
  }

  for (let i = 0; i < active.length; i++) {
    const p = active[i];
    const name = `${p.lastName}, ${p.firstName}`;
    const contract = contractLabelShort(p.contractedFrequency);
    const skill = p.skillLevel || "";
    const days = availableDayLabels(p.blockedDays ?? []);
    const vacText = formatAvailabilityText(p);

    const vacWidth = columns[4].width - 8;
    const vacLines = wrapText(vacText, vacWidth);
    const rowHeight = Math.max(rowMinHeight, 12 + vacLines.length * 10);

    // Page break check
    if (currentY + rowHeight > pageHeight - 40) {
      doc.addPage();
      currentY = drawPageHeader();
      currentY = drawTableHeader(currentY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
    }

    if (i % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "F");
    }
    doc.setDrawColor(220, 220, 220);
    doc.rect(marginLeft, currentY - 2, tableWidth, rowHeight, "S");

    // Cells
    let x = marginLeft;
    doc.setTextColor(0, 0, 0);
    doc.text(name, x + 4, currentY + 11);
    x += columns[0].width;
    doc.text(contract, x + 4, currentY + 11);
    x += columns[1].width;
    doc.text(skill, x + 4, currentY + 11);
    x += columns[2].width;
    doc.text(days, x + 4, currentY + 11);
    x += columns[3].width;
    // Vacation column — multi-line
    for (let li = 0; li < vacLines.length; li++) {
      doc.text(vacLines[li], x + 4, currentY + 11 + li * 10);
    }

    currentY += rowHeight;
  }

  // Footer with total + generation timestamp
  if (currentY + 24 > pageHeight - 30) {
    doc.addPage();
    currentY = drawPageHeader();
  }
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "italic");
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  doc.text(
    `${active.length} active player${active.length === 1 ? "" : "s"} · Generated ${dateStr}`,
    marginLeft,
    currentY + 16
  );

  openPdfWithName(
    doc,
    `Player-Availability-${startYear}-${endYear}`,
    "Player Availability"
  );
}
