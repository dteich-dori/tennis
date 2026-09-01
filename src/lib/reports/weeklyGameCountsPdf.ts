import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";
import { stampScheduleMark } from "./scheduleMark";
import { weeklyContractedGames, contractLabel } from "@/lib/contractFrequency";

interface PlayerInfo {
  id: number;
  firstName: string;
  lastName: string;
  contractedFrequency: string;
  isActive: boolean;
  excludedFromAutoAssign?: boolean;
}

interface GameAssignmentLite {
  playerId: number;
  slotPosition: number;
}

interface GameLite {
  weekNumber: number;
  status: string;
  group: string;
  assignments: GameAssignmentLite[];
}

interface Season {
  startDate: string;
  endDate: string;
  totalWeeks: number;
}

/**
 * Weekly Game Counts matrix.
 *   Rows = players (sorted by lastName), Contract players first then Subs.
 *   Cols = each week (1..N) + a Total column at the right.
 *   Cell = number of NORMAL Don's-group games that player was assigned in
 *          that week. Zeros render as "·" so non-zero values stand out.
 */
export function generateWeeklyGameCountsPdf(
  players: PlayerInfo[],
  games: GameLite[],
  season: Season,
  scheduleMark?: number
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  stampScheduleMark(doc, scheduleMark);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const startYear = season.startDate.substring(0, 4);
  const endYear = season.endDate.substring(0, 4);
  const totalWeeks = season.totalWeeks ?? 36;

  // Active, auto-assignable players sorted: contract first, then subs;
  // within each, by lastName. Players flagged "Exclude from auto-assign"
  // are dropped from this report — they're not part of the schedule.
  const sortedPlayers = [...players]
    .filter((p) => p.isActive && !p.excludedFromAutoAssign)
    .sort((a, b) => {
      const aSub = a.contractedFrequency === "0" ? 1 : 0;
      const bSub = b.contractedFrequency === "0" ? 1 : 0;
      if (aSub !== bSub) return aSub - bSub;
      return a.lastName.localeCompare(b.lastName);
    });

  if (sortedPlayers.length === 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("No active players found.", pageWidth / 2, 80, { align: "center" });
    openPdfWithName(
      doc,
      `Weekly-Game-Counts-${startYear}-${endYear}`,
      "Weekly Game Counts"
    );
    return;
  }

  // Build per-player per-week counts. Only NORMAL Don's-group games count.
  const counts = new Map<number, Map<number, number>>(); // playerId → weekNum → count
  const weekColumnTotals = new Map<number, number>(); // weekNum → sum across players
  const weekCapacity = new Map<number, number>();    // weekNum → 4 × games that week
  const suppressedByWeek = new Map<number, number>(); // weekNum → duplicate rows ignored
  for (const g of games) {
    if (g.status !== "normal") continue;
    if (g.group !== "dons") continue;
    // A game has four slots, but game_assignments currently holds MORE than
    // one row for some (game, slot) pairs — see docs/DB-CLEANUP-TODO.md.
    // The Schedule grid renders each slot with
    //     game.assignments.find((a) => a.slotPosition === slot)
    // which takes the FIRST row for that slot and never shows the rest, so
    // the extra rows are invisible on screen. Counting every row here made
    // this report disagree with the schedule (e.g. Rick Simon showed 5 games
    // in week 22 of the 2026-27 season against the 2 the schedule shows).
    // Mirror the grid's rule: count one row per slot, the first one.
    // This HIDES the duplicate rows; it does not remove them. Once the table
    // is cleaned up, this guard becomes a harmless no-op and can be dropped.
    const slotSeen = new Set<number>();
    for (const a of g.assignments) {
      if (slotSeen.has(a.slotPosition)) {
        // Duplicate row for a slot already counted. Tally it so the sanity
        // check below can tell the reader the underlying data is dirty.
        suppressedByWeek.set(
          g.weekNumber,
          (suppressedByWeek.get(g.weekNumber) ?? 0) + 1
        );
        continue;
      }
      slotSeen.add(a.slotPosition);
      const wkMap = counts.get(a.playerId) ?? new Map<number, number>();
      wkMap.set(g.weekNumber, (wkMap.get(g.weekNumber) ?? 0) + 1);
      counts.set(a.playerId, wkMap);
      weekColumnTotals.set(g.weekNumber, (weekColumnTotals.get(g.weekNumber) ?? 0) + 1);
    }
    // Capacity for the week: 4 slots per Don's normal game.
    weekCapacity.set(g.weekNumber, (weekCapacity.get(g.weekNumber) ?? 0) + 4);
  }

  //  SANITY CHECK (Rudor's, 31 Aug 2026). A week's column can never legitimately
  //  total more than 4 x the number of Don's normal games in it — 60 in a
  //  typical 15-game week. If it does, the report is describing something
  //  impossible and should say so on its face rather than print a plausible
  //  wrong number. Weeks that fail are listed in the header and their column
  //  total is printed in red.
  //
  //  With the slot dedupe above in place this should never fire; it is a
  //  backstop against the NEXT way the data goes wrong. `suppressedByWeek` is
  //  the softer signal — it fires today, and reports how many duplicate rows
  //  were ignored to keep this report honest.
  const overCapacityWeeks: number[] = [];
  for (const [wk, total] of weekColumnTotals) {
    const cap = weekCapacity.get(wk) ?? 0;
    if (total > cap) overCapacityWeeks.push(wk);
  }
  overCapacityWeeks.sort((a, b) => a - b);

  const suppressedTotal = [...suppressedByWeek.values()].reduce((a, b) => a + b, 0);
  const suppressedWeeks = [...suppressedByWeek.keys()].sort((a, b) => a - b);

  // Layout constants. With ~36 week columns + name + total we need narrow cells.
  const marginLeft = 24;
  const marginRight = 24;
  const marginTop = 28;
  const usableW = pageWidth - marginLeft - marginRight;
  const nameColW = 96;
  const totalColW = 28;
  const weekColW = (usableW - nameColW - totalColW) / totalWeeks;
  const rowHeight = 12;
  const headerRowHeight = 14;

  const drawHeader = (y: number, pageLabel: string): number => {
    stampScheduleMark(doc, scheduleMark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(
      `Weekly Game Counts — Brooklake Tennis ${startYear}-${endYear}`,
      pageWidth / 2,
      y,
      { align: "center" }
    );
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `Don's group · normal-status games only · counts per week · green = over basic contract${pageLabel ? ` · ${pageLabel}` : ""}`,
      pageWidth / 2,
      y,
      { align: "center" }
    );
    y += 10;

    // Data-integrity banner. Silence here means the checks passed.
    if (overCapacityWeeks.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(180, 0, 0);
      doc.text(
        `DATA ERROR — week ${overCapacityWeeks.join(", ")} total(s) exceed 4 x the games played that week. Figures below cannot be trusted.`,
        pageWidth / 2, y, { align: "center" }
      );
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      y += 10;
    }
    if (suppressedTotal > 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(180, 90, 0);
      doc.text(
        `Note: ${suppressedTotal} duplicate slot entr${suppressedTotal === 1 ? "y" : "ies"} ignored in week ${suppressedWeeks.join(", ")} — counts below match the schedule. See docs/DB-CLEANUP-TODO.md.`,
        pageWidth / 2, y, { align: "center" }
      );
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      y += 10;
    }
    return y;
  };

  let currentY = drawHeader(marginTop, "");

  // Column header row: "Player" | W1 | W2 | ... | WN | Total
  const drawColumnHeader = (y: number): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setFillColor(225, 225, 225);
    doc.rect(marginLeft, y, usableW, headerRowHeight, "F");
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.4);

    doc.text("Player", marginLeft + 4, y + headerRowHeight - 4);
    for (let w = 1; w <= totalWeeks; w++) {
      const cx = marginLeft + nameColW + (w - 0.5) * weekColW;
      doc.text(String(w), cx, y + headerRowHeight - 4, { align: "center" });
    }
    doc.text("Tot", marginLeft + nameColW + totalWeeks * weekColW + totalColW / 2, y + headerRowHeight - 4, { align: "center" });

    // vertical gridlines
    doc.line(marginLeft + nameColW, y, marginLeft + nameColW, y + headerRowHeight);
    for (let w = 1; w <= totalWeeks; w++) {
      const x = marginLeft + nameColW + w * weekColW;
      doc.line(x, y, x, y + headerRowHeight);
    }
    doc.rect(marginLeft, y, usableW, headerRowHeight, "S");
    return y + headerRowHeight;
  };

  currentY = drawColumnHeader(currentY);

  // Helper for new pages
  const ensureRowFits = (y: number): number => {
    if (y + rowHeight > pageHeight - 30) {
      doc.addPage();
      let ny = drawHeader(marginTop, `(continued)`);
      ny = drawColumnHeader(ny);
      return ny;
    }
    return y;
  };

  // Detect duplicate last names
  const lastNameCounts = new Map<string, number>();
  for (const p of sortedPlayers) {
    lastNameCounts.set(p.lastName, (lastNameCounts.get(p.lastName) ?? 0) + 1);
  }
  const displayName = (p: PlayerInfo) =>
    (lastNameCounts.get(p.lastName) ?? 0) > 1
      ? `${p.lastName}, ${p.firstName.charAt(0)}`
      : p.lastName;

  // Row rendering
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setLineWidth(0.25);

  let lastTierWasSub: boolean | null = null;
  let altRow = false;

  for (const p of sortedPlayers) {
    currentY = ensureRowFits(currentY);
    const isSub = p.contractedFrequency === "0";

    // Section divider between contract and subs
    if (lastTierWasSub === false && isSub === true) {
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.8);
      doc.line(marginLeft, currentY, marginLeft + usableW, currentY);
      doc.setLineWidth(0.25);
      doc.setDrawColor(180, 180, 180);
      currentY += 2;
      currentY = ensureRowFits(currentY);
    }
    lastTierWasSub = isSub;

    // Alternating zebra
    if (altRow) {
      doc.setFillColor(250, 247, 240);
      doc.rect(marginLeft, currentY, usableW, rowHeight, "F");
    }
    altRow = !altRow;

    doc.setDrawColor(220, 220, 220);

    // Player name + contract value, e.g. "Smith (2x+)"
    doc.setFont("helvetica", "normal");
    doc.text(
      `${displayName(p)} (${contractLabel(p.contractedFrequency)})`,
      marginLeft + 4,
      currentY + rowHeight - 3
    );

    // Week cells. Highlight in green when the player exceeded their
    // basic per-week contract (e.g. 1x player with 2 games this week,
    // sub with any game at all).
    const baseFreq = weeklyContractedGames(p.contractedFrequency);
    let rowTotal = 0;
    const wkMap = counts.get(p.id);
    for (let w = 1; w <= totalWeeks; w++) {
      const c = wkMap?.get(w) ?? 0;
      rowTotal += c;
      const cellX = marginLeft + nameColW + (w - 1) * weekColW;
      const cx = cellX + weekColW / 2;

      if (c > baseFreq) {
        // Fill cell with a soft green so the over-contract weeks pop out.
        doc.setFillColor(190, 230, 190);
        doc.rect(cellX, currentY, weekColW, rowHeight, "F");
      }

      if (c > 0) {
        doc.text(String(c), cx, currentY + rowHeight - 3, { align: "center" });
      } else {
        doc.setTextColor(200, 200, 200);
        doc.text("·", cx, currentY + rowHeight - 3, { align: "center" });
        doc.setTextColor(0, 0, 0);
      }
    }

    // Total
    doc.setFont("helvetica", "bold");
    doc.text(
      String(rowTotal),
      marginLeft + nameColW + totalWeeks * weekColW + totalColW / 2,
      currentY + rowHeight - 3,
      { align: "center" }
    );

    // Right border for total column
    doc.line(
      marginLeft + nameColW + totalWeeks * weekColW,
      currentY,
      marginLeft + nameColW + totalWeeks * weekColW,
      currentY + rowHeight
    );

    currentY += rowHeight;
  }

  // Totals row at the bottom of the last page (or new page)
  currentY = ensureRowFits(currentY + 2);
  doc.setFillColor(230, 230, 230);
  doc.rect(marginLeft, currentY, usableW, rowHeight + 2, "F");
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, currentY, usableW, rowHeight + 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Total", marginLeft + 4, currentY + rowHeight - 2);

  let grandTotal = 0;
  const overSet = new Set(overCapacityWeeks);
  for (let w = 1; w <= totalWeeks; w++) {
    const c = weekColumnTotals.get(w) ?? 0;
    grandTotal += c;
    const cx = marginLeft + nameColW + (w - 0.5) * weekColW;
    // A week's total above 4 × its games is impossible — print it in red.
    if (overSet.has(w)) doc.setTextColor(180, 0, 0);
    doc.text(c > 0 ? String(c) : "·", cx, currentY + rowHeight - 2, {
      align: "center",
    });
    if (overSet.has(w)) doc.setTextColor(0, 0, 0);
  }
  doc.text(
    String(grandTotal),
    marginLeft + nameColW + totalWeeks * weekColW + totalColW / 2,
    currentY + rowHeight - 2,
    { align: "center" }
  );

  openPdfWithName(
    doc,
    `Weekly-Game-Counts-${startYear}-${endYear}`,
    "Weekly Game Counts"
  );
}
