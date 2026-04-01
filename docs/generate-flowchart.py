#!/usr/bin/env python3
"""Generate Auto-Assign Algorithm Flowchart PDF"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import (
    HexColor, white, black, lightgrey
)
from reportlab.pdfgen import canvas

OUTPUT = "docs/auto-assign-flowchart.pdf"

# Colors
BLUE = HexColor("#3B82F6")
DARK_BLUE = HexColor("#1E40AF")
GREEN = HexColor("#22C55E")
DARK_GREEN = HexColor("#15803D")
ORANGE = HexColor("#F97316")
DARK_ORANGE = HexColor("#C2410C")
RED = HexColor("#EF4444")
PURPLE = HexColor("#8B5CF6")
TEAL = HexColor("#14B8A6")
GRAY = HexColor("#6B7280")
LIGHT_BLUE = HexColor("#DBEAFE")
LIGHT_GREEN = HexColor("#DCFCE7")
LIGHT_ORANGE = HexColor("#FFF7ED")
LIGHT_PURPLE = HexColor("#F3E8FF")
LIGHT_TEAL = HexColor("#CCFBF1")
LIGHT_RED = HexColor("#FEE2E2")
LIGHT_GRAY = HexColor("#F3F4F6")

W, H = letter  # 612 x 792

def draw_rounded_rect(c, x, y, w, h, r, fill_color, stroke_color=None):
    """Draw a rounded rectangle"""
    c.saveState()
    c.setFillColor(fill_color)
    if stroke_color:
        c.setStrokeColor(stroke_color)
        c.setLineWidth(1.5)
    else:
        c.setStrokeColor(fill_color)
    p = c.beginPath()
    p.roundRect(x, y, w, h, r)
    p.close()
    if stroke_color:
        c.drawPath(p, fill=1, stroke=1)
    else:
        c.drawPath(p, fill=1, stroke=0)
    c.restoreState()

def draw_diamond(c, cx, cy, w, h, fill_color, stroke_color=None):
    """Draw a diamond shape centered at cx, cy"""
    c.saveState()
    c.setFillColor(fill_color)
    if stroke_color:
        c.setStrokeColor(stroke_color)
        c.setLineWidth(1.5)
    else:
        c.setStrokeColor(fill_color)
    p = c.beginPath()
    p.moveTo(cx, cy + h/2)
    p.lineTo(cx + w/2, cy)
    p.lineTo(cx, cy - h/2)
    p.lineTo(cx - w/2, cy)
    p.close()
    if stroke_color:
        c.drawPath(p, fill=1, stroke=1)
    else:
        c.drawPath(p, fill=1, stroke=0)
    c.restoreState()

def draw_arrow(c, x1, y1, x2, y2, color=GRAY):
    """Draw an arrow from (x1,y1) to (x2,y2)"""
    c.saveState()
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(1.5)
    c.line(x1, y1, x2, y2)
    # Arrowhead
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    size = 6
    p = c.beginPath()
    p.moveTo(x2, y2)
    p.lineTo(x2 - size * math.cos(angle - 0.4), y2 - size * math.sin(angle - 0.4))
    p.lineTo(x2 - size * math.cos(angle + 0.4), y2 - size * math.sin(angle + 0.4))
    p.close()
    c.drawPath(p, fill=1, stroke=0)
    c.restoreState()

def draw_box(c, x, y, w, h, text, fill, border=None, text_color=white, font_size=8, bold=True):
    """Draw a labeled box"""
    draw_rounded_rect(c, x, y, w, h, 6, fill, border)
    c.saveState()
    c.setFillColor(text_color)
    if bold:
        c.setFont("Helvetica-Bold", font_size)
    else:
        c.setFont("Helvetica", font_size)
    lines = text.split("\n")
    total_h = len(lines) * (font_size + 2)
    start_y = y + h/2 + total_h/2 - font_size + 1
    for i, line in enumerate(lines):
        tw = c.stringWidth(line, "Helvetica-Bold" if bold else "Helvetica", font_size)
        c.drawString(x + (w - tw)/2, start_y - i * (font_size + 2), line)
    c.restoreState()

def draw_label(c, x, y, text, color=GRAY, size=7, align="center"):
    """Draw a small label"""
    c.saveState()
    c.setFillColor(color)
    c.setFont("Helvetica", size)
    if align == "center":
        tw = c.stringWidth(text, "Helvetica", size)
        c.drawString(x - tw/2, y, text)
    elif align == "left":
        c.drawString(x, y, text)
    elif align == "right":
        tw = c.stringWidth(text, "Helvetica", size)
        c.drawString(x - tw, y, text)
    c.restoreState()


def page1(c):
    """Page 1: Main assignment flow"""
    # Title
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(black)
    c.drawCentredString(W/2, H - 40, "Tennis Scheduler - Auto-Assign Algorithm")
    c.setFont("Helvetica", 9)
    c.setFillColor(GRAY)
    c.drawCentredString(W/2, H - 55, "Don's Group Game Assignment Flow")

    cx = W / 2
    bw = 180  # box width
    bh = 28   # box height
    gap = 10

    # --- PREPARATION SECTION ---
    y = H - 90
    draw_box(c, cx - bw/2, y - bh, bw, bh, "Load Season Data", DARK_BLUE)
    draw_label(c, cx - bw/2 - 5, y - bh/2 - 3, "Players, games, vacations,\nblocked days, DNP, counts", GRAY, 6, "right")

    y -= bh + gap
    draw_arrow(c, cx, y + gap, cx, y - gap + 2)
    y -= gap
    draw_box(c, cx - bw/2, y - bh, bw, bh, "Compute Front-Loading", DARK_BLUE)
    draw_label(c, cx + bw/2 + 5, y - bh/2 - 3, "Vacation-aware adjusted freq\n(up to freq + 1 per week)", GRAY, 6, "left")

    y -= bh + gap
    draw_arrow(c, cx, y + gap, cx, y - gap + 2)
    y -= gap
    draw_box(c, cx - bw/2, y - bh, bw, bh, "Sort Days: Tightest First", DARK_BLUE)
    draw_label(c, cx + bw/2 + 5, y - bh/2 - 3, "Scarce days get first pick\nfrom full player pool", GRAY, 6, "left")

    # --- PER-DAY LOOP ---
    y -= bh + gap + 5
    draw_arrow(c, cx, y + gap + 5, cx, y - gap + 2)
    y -= gap

    # Loop box
    loop_y = y
    loop_h = 370
    draw_rounded_rect(c, 40, y - loop_h, W - 80, loop_h, 10, LIGHT_GRAY, GRAY)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(DARK_BLUE)
    c.drawString(50, y - 14, "FOR EACH DAY (tightest first)  >  FOR EACH GAME  >  FOR EACH EMPTY SLOT:")

    y -= 30

    # Pass boxes - left column
    px = 80
    pw = 200
    ph = 24
    pgap = 6

    # Pass 1
    draw_box(c, px, y - ph, pw, ph, "Pass 1: First-Game-Only", GREEN, DARK_GREEN, white, 7)
    draw_label(c, px + pw + 8, y - ph/2 - 2, "Players with WTD = 0 (no games yet this week)", GRAY, 6, "left")
    y -= ph + pgap

    # Pass 2
    draw_box(c, px, y - ph, pw, ph, "Pass 2: Base-Owed", GREEN, DARK_GREEN, white, 7)
    draw_label(c, px + pw + 8, y - ph/2 - 2, "Players with freq - WTD > 0 (still owe games)", GRAY, 6, "left")
    y -= ph + pgap

    # Pass 2.5
    draw_box(c, px, y - ph, pw, ph, "Pass 2.5: Front-Loading", TEAL, None, white, 7)
    draw_label(c, px + pw + 8, y - ph/2 - 2, "Vacation makeup: adjustedFreq > baseFreq, met base", GRAY, 6, "left")
    y -= ph + pgap

    # Pass 2.8
    draw_box(c, px, y - ph, pw, ph, "Pass 2.8: cGamesOk", TEAL, None, white, 7)
    draw_label(c, px + pw + 8, y - ph/2 - 2, "A/B players in C-player games (frequency-limited)", GRAY, 6, "left")
    y -= ph + pgap

    # Pass 3
    draw_box(c, px, y - ph, pw, ph, "Pass 3: Extras", ORANGE, DARK_ORANGE, white, 7)
    draw_label(c, px + pw + 8, y - ph/2 - 2, "2+ players beyond weekly min (checkbox)", GRAY, 6, "left")
    y -= ph + pgap

    # Pass 3.5
    draw_box(c, px, y - ph, pw, ph, "Pass 3.5: STD Catchup", ORANGE, DARK_ORANGE, white, 7)
    draw_label(c, px + pw + 8, y - ph/2 - 2, "Season-deficit players (2nd pass only, checkbox)", GRAY, 6, "left")
    y -= ph + pgap

    # Pass 4
    draw_box(c, px, y - ph, pw, ph, "Pass 4: Subs", PURPLE, None, white, 7)
    draw_label(c, px + pw + 8, y - ph/2 - 2, "Substitute players fill remaining gaps (checkbox)", GRAY, 6, "left")
    y -= ph + pgap + 2

    # Decision
    draw_label(c, px + pw/2, y - 3, "Eligible player found?", black, 7, "center")
    y -= 14

    # Two outcomes
    draw_box(c, px, y - 20, pw/2 - 5, 20, "Assign Player", GREEN, None, white, 7)
    draw_box(c, px + pw/2 + 5, y - 20, pw/2 - 5, 20, "Slot Left Empty", RED, None, white, 7)
    y -= 20 + pgap

    # Post-day
    draw_box(c, px, y - ph, pw, ph, "DNP-Unblock Repair", DARK_BLUE, None, white, 7)
    draw_label(c, px + pw + 8, y - ph/2 - 2, "Swap blockers to free under-assigned players", GRAY, 6, "left")
    y -= ph + pgap

    draw_box(c, px, y - ph, pw, ph, "Composition Swaps", DARK_BLUE, None, white, 7)
    draw_label(c, px + pw + 8, y - ph/2 - 2, "Same-level same-day swaps for better A/B/C mix", GRAY, 6, "left")

    # --- POST-LOOP SECTION ---
    y = loop_y - loop_h - gap - 5
    draw_arrow(c, cx, y + gap + 5, cx, y - gap + 2)
    y -= gap

    draw_box(c, cx - bw/2, y - bh, bw, bh, "Cross-Day Composition Swaps", DARK_BLUE)
    y -= bh + gap
    draw_arrow(c, cx, y + gap, cx, y - gap + 2)
    y -= gap

    draw_box(c, cx - bw/2, y - bh, bw, bh, "Integrity Check", RED, None, white, 8)
    draw_label(c, cx + bw/2 + 5, y - bh/2 - 2, "Detect duplicate same-day assignments", GRAY, 6, "left")


def page2(c):
    """Page 2: Full-Season Flow (Season Setup)"""
    c.showPage()

    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(black)
    c.drawCentredString(W/2, H - 40, "Full-Season Auto-Assign Flow")
    c.setFont("Helvetica", 9)
    c.setFillColor(GRAY)
    c.drawCentredString(W/2, H - 55, "Season Setup Page - Auto-Assign Don's")

    cx = W / 2
    bw = 220
    bh = 32
    gap = 18

    y = H - 95

    # Step 1
    draw_box(c, cx - bw/2, y - bh, bw, bh, "1. Auto-Assign Solo Games", BLUE, None, white, 9)
    draw_label(c, cx + bw/2 + 8, y - bh/2 - 2, "Must be done first (prerequisite)", GRAY, 7, "left")

    y -= bh + gap
    draw_arrow(c, cx, y + gap, cx, y - gap + 5)
    y -= gap

    # Step 2
    draw_box(c, cx - bw/2, y - bh, bw, bh, "2. Week-by-Week Assignment", GREEN, DARK_GREEN, white, 9)
    draw_label(c, cx + bw/2 + 8, y - bh/2 - 8, "Passes 1, 2, 2.5, 2.8, 3, 4", GRAY, 7, "left")
    draw_label(c, cx + bw/2 + 8, y - bh/2 + 4, "Sequential: Week 1 -> 37", GRAY, 7, "left")

    y -= bh + gap
    draw_arrow(c, cx, y + gap, cx, y - gap + 5)
    y -= gap

    # Step 3
    draw_box(c, cx - bw/2, y - bh, bw, bh, "3. STD Catchup Pass", ORANGE, DARK_ORANGE, white, 9)
    draw_label(c, cx + bw/2 + 8, y - bh/2 - 8, "Re-run all weeks with Pass 3.5", GRAY, 7, "left")
    draw_label(c, cx + bw/2 + 8, y - bh/2 + 4, "Fill gaps with season-deficit players", GRAY, 7, "left")

    y -= bh + gap
    draw_arrow(c, cx, y + gap, cx, y - gap + 5)
    y -= gap

    # Step 4
    draw_box(c, cx - bw/2, y - bh, bw, bh, "4. Balance Pairings", DARK_BLUE, None, white, 9)
    draw_label(c, cx + bw/2 + 8, y - bh/2 - 2, "Same-level same-day swaps to reduce concentrations", GRAY, 7, "left")

    y -= bh + gap
    draw_arrow(c, cx, y + gap, cx, y - gap + 5)
    y -= gap

    # Step 5
    draw_box(c, cx - bw/2, y - bh, bw, bh, "5. Balance Don's Balls", DARK_BLUE, None, white, 9)
    draw_label(c, cx + bw/2 + 8, y - bh/2 - 2, "Redistribute ball-bringing duty (~1/4 per player)", GRAY, 7, "left")

    y -= bh + gap + 10
    draw_arrow(c, cx, y + gap + 10, cx, y - gap + 5)
    y -= gap

    draw_box(c, cx - bw/2, y - bh, bw, bh, "Complete", GREEN, None, white, 10)

    # --- Priority Scoring Box ---
    y -= bh + 40
    bx = 50
    bw2 = W - 100
    bh2 = 175
    draw_rounded_rect(c, bx, y - bh2, bw2, bh2, 8, LIGHT_BLUE, BLUE)

    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(DARK_BLUE)
    c.drawString(bx + 12, y - 16, "Player Priority Scoring (highest to lowest)")

    c.setFont("Helvetica", 8)
    c.setFillColor(black)
    priorities = [
        ("1. Must-Play", "Only 1 playable day left this week and still owes games"),
        ("2. Composition", "Avoid creating A+C games without B bridges"),
        ("3. Pairing Diversity", "Prefer players paired LESS with current game members"),
        ("4. Games Owed (WTD)", "More games owed = higher priority"),
        ("5. Playable Days Left", "Fewer remaining days = higher priority"),
        ("6. YTD Deficit", "Behind pace through current week"),
        ("7. STD Deficit", "Behind on full 36-week season contract"),
        ("8. Random Tiebreaker", "Equal candidates chosen randomly"),
    ]
    py = y - 32
    for label, desc in priorities:
        c.setFont("Helvetica-Bold", 8)
        c.drawString(bx + 15, py, label)
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAY)
        c.drawString(bx + 160, py, desc)
        c.setFillColor(black)
        py -= 17

    # --- Constraints Box ---
    y = py - 20
    bh3 = 140
    draw_rounded_rect(c, bx, y - bh3, bw2, bh3, 8, LIGHT_RED, RED)

    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(HexColor("#991B1B"))
    c.drawString(bx + 12, y - 16, "Hard Blocks (player excluded from game)")

    c.setFont("Helvetica", 7.5)
    c.setFillColor(black)
    constraints = [
        "Already assigned to this game  |  Already playing another game on same date  |  Blocked day of week",
        "On vacation during game date  |  Do-not-pair conflict with assigned player  |  No early games (before 10:00)",
        "No consecutive days violated  |  Derated pairing limit exceeded  |  Season-total cap reached",
        "A player (without cGamesOk) paired with C player  |  Frequency fully met (non-extras mode)",
    ]
    py = y - 34
    for line in constraints:
        c.drawString(bx + 15, py, line)
        py -= 14


# Generate
c = canvas.Canvas(OUTPUT, pagesize=letter)
page1(c)
page2(c)
c.save()
print(f"Flowchart saved to {OUTPUT}")
