import jsPDF from "jspdf";
import { openPdfWithName } from "./openPdfWithName";

/**
 * Generate a 2-page flowchart PDF for the auto-assign algorithm.
 * Page 1: Per-week assignment flow with all passes
 * Page 2: Full-season flow + priority scoring + hard blocks
 */
export function generateFlowchartPdf(): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  function drawBox(x: number, y: number, w: number, h: number, text: string, fillR: number, fillG: number, fillB: number, textWhite = true, fontSize = 8) {
    doc.setFillColor(fillR, fillG, fillB);
    doc.roundedRect(x, y, w, h, 4, 4, "F");
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textWhite ? 255 : 0, textWhite ? 255 : 0, textWhite ? 255 : 0);
    doc.text(text, x + w / 2, y + h / 2 + fontSize / 3, { align: "center" });
  }

  function drawNote(x: number, y: number, text: string, align: "left" | "right" = "left") {
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    if (align === "right") {
      doc.text(text, x, y, { align: "right" });
    } else {
      doc.text(text, x, y);
    }
  }

  function arrow(x1: number, y1: number, x2: number, y2: number) {
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(1);
    doc.line(x1, y1, x2, y2);
    // Simple arrowhead
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const s = 5;
    doc.setFillColor(150, 150, 150);
    doc.triangle(
      x2, y2,
      x2 - s * Math.cos(angle - 0.4), y2 - s * Math.sin(angle - 0.4),
      x2 - s * Math.cos(angle + 0.4), y2 - s * Math.sin(angle + 0.4),
      "F"
    );
  }

  // ===================== PAGE 1 =====================
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Auto-Assign Algorithm — Per-Week Flow", W / 2, 30, { align: "center" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Don's Group Game Assignment", W / 2, 42, { align: "center" });

  const cx = W / 2;
  const bw = 190;
  const bh = 24;
  const gap = 12;
  let y = 60;

  // Preparation
  drawBox(cx - bw / 2, y, bw, bh, "Load Season Data", 30, 64, 175);
  drawNote(cx + bw / 2 + 8, y + bh / 2, "Players, games, vacations, blocked days, DNP, YTD/STD counts");
  y += bh + gap;
  arrow(cx, y - gap, cx, y);

  drawBox(cx - bw / 2, y, bw, bh, "Compute Front-Loading (Vacation Makeup)", 30, 64, 175);
  drawNote(cx + bw / 2 + 8, y + bh / 2, "Adjusted freq up to base+1 for players with upcoming vacations");
  y += bh + gap;
  arrow(cx, y - gap, cx, y);

  drawBox(cx - bw / 2, y, bw, bh, "Sort Days: Tightest First", 30, 64, 175);
  drawNote(cx + bw / 2 + 8, y + bh / 2, "Most constrained days get first pick from full player pool");
  y += bh + gap + 5;
  arrow(cx, y - gap - 5, cx, y);

  // Loop header
  doc.setFillColor(243, 244, 246);
  doc.setDrawColor(180, 180, 180);
  doc.roundedRect(35, y - 2, W - 70, 380, 6, 6, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 64, 175);
  doc.text("FOR EACH DAY > FOR EACH GAME > FOR EACH EMPTY SLOT:", 45, y + 10);
  y += 20;

  // Passes
  const px = 65;
  const pw = 190;
  const ph = 20;
  const pg = 5;

  const passes: [string, number, number, number, string][] = [
    ["Pass 1: First-Game-Only", 34, 197, 94, "Players with WTD = 0 (no games yet this week)"],
    ["Pass 2: Base-Owed", 34, 197, 94, "Players with freq - WTD > 0 (still owe games)"],
    ["Pass 2.5: Front-Loading", 20, 184, 166, "Vacation makeup: adjustedFreq > baseFreq, base contract met"],
    ["Pass 2.8: cGamesOk", 20, 184, 166, "A/B players willing to play in C-player games (freq-limited)"],
    ["Pass 3: Extras (checkbox)", 249, 115, 22, "2+ players beyond weekly minimum of 2 games"],
    ["Pass 3.5: STD Catchup (2nd pass)", 249, 115, 22, "Season-deficit players (only in full-season 2nd pass)"],
    ["Pass 4: Subs (checkbox)", 139, 92, 246, "Substitute (freq 0) players fill remaining gaps"],
  ];

  for (const [label, r, g, b, note] of passes) {
    drawBox(px, y, pw, ph, label, r, g, b);
    drawNote(px + pw + 8, y + ph / 2 + 1, note);
    y += ph + pg;
  }

  y += 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Eligible player found?", px + 30, y);

  y += 8;
  drawBox(px, y, pw / 2 - 5, 18, "Assign Player", 34, 197, 94);
  drawBox(px + pw / 2 + 5, y, pw / 2 - 5, 18, "Slot Left Empty", 239, 68, 68);
  y += 18 + pg + 5;

  // Post-day
  drawBox(px, y, pw, ph, "DNP-Unblock Repair", 30, 64, 175);
  drawNote(px + pw + 8, y + ph / 2 + 1, "Swap DNP blockers to free under-assigned players");
  y += ph + pg;

  drawBox(px, y, pw, ph, "Same-Day Composition Swaps", 30, 64, 175);
  drawNote(px + pw + 8, y + ph / 2 + 1, "Same-level swaps between courts for better A/B/C mix");

  // After loop
  y += ph + 20;
  arrow(cx, y - 8, cx, y + 2);

  drawBox(cx - bw / 2, y + 2, bw, bh, "Cross-Day Composition Swaps", 30, 64, 175);
  y += bh + gap;
  arrow(cx, y, cx, y + gap);

  drawBox(cx - bw / 2, y + gap, bw, bh, "Integrity Check (Duplicate Detection)", 239, 68, 68);

  // ===================== PAGE 2 =====================
  doc.addPage();

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Full-Season Auto-Assign Flow", W / 2, 30, { align: "center" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Season Setup Page — Auto-Assign Don's", W / 2, 42, { align: "center" });

  const sw = 230;
  const sh = 30;
  const sg = 16;
  y = 65;

  const steps: [string, number, number, number, string][] = [
    ["1. Auto-Assign Solo Games", 59, 130, 246, "Must be done first (prerequisite)"],
    ["2. Week-by-Week Assignment", 34, 197, 94, "Passes 1, 2, 2.5, 2.8, 3, 4 — sequential Week 1 to 37"],
    ["3. STD Catchup Pass", 249, 115, 22, "Re-run all weeks with Pass 3.5 for season-deficit players"],
    ["4. Balance Pairings", 30, 64, 175, "Same-level same-day swaps to reduce pairing concentrations"],
    ["5. Balance Don's Balls", 30, 64, 175, "Redistribute ball-bringing duty (~1/4 per player)"],
  ];

  for (const [label, r, g, b, note] of steps) {
    drawBox(cx - sw / 2, y, sw, sh, label, r, g, b, true, 9);
    drawNote(cx + sw / 2 + 8, y + sh / 2 + 1, note);
    y += sh + sg;
    if (label !== steps[steps.length - 1][0]) {
      arrow(cx, y - sg, cx, y - 4);
    }
  }

  y += 5;
  drawBox(cx - sw / 2, y, sw, sh, "Complete", 34, 197, 94, true, 10);

  // Priority Scoring
  y += sh + 30;
  doc.setFillColor(219, 234, 254);
  doc.setDrawColor(59, 130, 246);
  doc.roundedRect(45, y, W - 90, 160, 6, 6, "FD");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 64, 175);
  doc.text("Player Priority Scoring (highest to lowest)", 57, y + 16);

  const priorities: [string, string][] = [
    ["1. Must-Play", "Only 1 playable day left this week and still owes games"],
    ["2. Composition", "Avoid creating A+C games without B bridges"],
    ["3. Pairing Diversity", "Prefer players paired LESS with current game members"],
    ["4. Games Owed (WTD)", "More games owed this week = higher priority"],
    ["5. Playable Days Left", "Fewer remaining days this week = higher priority"],
    ["6. YTD Deficit", "Behind pace through current week"],
    ["7. STD Deficit", "Behind on full 36-week season contract"],
    ["8. Random Tiebreaker", "Equal candidates chosen randomly"],
  ];

  let py = y + 32;
  for (const [label, desc] of priorities) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(label, 60, py);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(desc, 170, py);
    py += 16;
  }

  // Hard Blocks
  y += 175;
  doc.setFillColor(254, 226, 226);
  doc.setDrawColor(239, 68, 68);
  doc.roundedRect(45, y, W - 90, 105, 6, 6, "FD");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(153, 27, 27);
  doc.text("Hard Blocks (player excluded from game)", 57, y + 16);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  const blocks = [
    "Already assigned to this game  |  Already playing another game on same date  |  Blocked day of week",
    "On vacation during game date  |  Do-not-pair conflict with assigned player  |  No early games (before 10:00)",
    "No consecutive days violated  |  Derated pairing limit exceeded  |  Season-total cap reached (non-2+ players)",
    "A player (without cGamesOk) paired with C player  |  Frequency fully met (non-extras mode)",
    "cGamesOk frequency limit exceeded for this week/period",
  ];
  py = y + 32;
  for (const line of blocks) {
    doc.text(line, 60, py);
    py += 13;
  }

  openPdfWithName(doc, "Auto-Assign-Flowchart", "Auto-Assign Algorithm Flowchart");
}
