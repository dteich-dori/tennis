# Tennis Club Scheduler - Product Requirements Document (PRD)

**Document Version:** 1.0  
**Date:** February 8, 2026  
**Author:** Rudor Teich with Claude

---

## 1. Executive Summary

### Purpose
Create a web-based application to manage scheduling, player assignments, and reporting for a tennis club with 40+ players across a 36-week season. The system will replace the current Microsoft Access solution with a more maintainable, AI-assisted codebase.

### User
Single administrator (Rudor) manages all scheduling. Future feature: read-only player access (low priority).

### Core Value
- Automate season game generation
- Guide manual player assignments with intelligent filtering and constraints
- Validate assignments against complex rules
- Generate professional PDF reports
- Balance ball-bringing duties fairly

---

## 2. System Overview

### Platform
- **Type:** Web application (local server on macOS)
- **Access:** Browser-based interface
- **Future:** Remote internet access (not initial release)
- **Technology Stack (Recommended):**
  - Backend: Python + Flask
  - Database: SQLite
  - Frontend: HTML/CSS + Alpine.js or HTMX

### Two Player Groups
1. **Don's Group** (Main)
   - ~40 players
   - Multiple courts
   - Standard display in reports

2. **Solo Group** (Subset)
   - By invitation only
   - 2-3 dedicated court slots
   - Share-based participation (full/half/quarter shares)
   - Orange font in consolidated reports
   - Set up before Don's games (takes priority)

---

## 3. Core Data Models

### 3.1 Season
- **Start Date:** Monday only (validated)
- **Duration:** 36 weeks (auto-calculated from start date)
- **Holidays:** Individual dates (courts closed)
- **Makeup Weeks:** 1-2 additional weeks at end (optional)

### 3.2 Court Schedule
- **Fields:**
  - Day of week
  - Court number (1-6, physical court IDs)
  - Start time
  - Group flag (Don's = default, Solo = flagged)
- **Entry:** Manual, ~14 total court slots
- **Editable:** Yes, with regeneration option

### 3.3 Player
**Basic Information:**
- First name
- Last name (family name)
- Cell number
- Home number
- Email address
- Active status (Yes/No)

**Scheduling Data:**
- Contracted frequency: 1, 2, or 2+ games per week
  - 1 = 36 games total (once/week)
  - 2 = 72 games total (twice/week)
  - 2+ = 72+ games (twice + available for extras)
- Skill level: A, B, C, or D (internal only, never shown to players)
- Blocked weekdays (checkboxes for days cannot play)
- Vacation dates (multiple date ranges allowed)
- "Do not pair with" (2 player ID fields, bidirectional)
- No consecutive days flag (for physical limitations)

**Solo-Specific (if applicable):**
- Share level: Full, Half, or Quarter
  - Full = once per week
  - Half = once every 2 weeks
  - Quarter = once every 4 weeks

**Tracking Variables:**
- Games assigned this week (WTD)
- Games assigned year-to-date (YTD)
- Ball-bringing count (separate for Don's and Solo)

**Display Rules:**
- Always sort by family name
- Display as family name only (add first initial for duplicates: "TeichR")
- Format: FamilyName, FirstName (when listed separately)

### 3.4 Game
- **Properties:**
  - Game number (sequential, permanent across season)
  - Week number (1-36+)
  - Date
  - Day of week
  - Start time
  - Court number
  - Group (Don's or Solo)
  - 4 player slots
  - Status: Normal, Holiday, Blanked
  
- **Rules:**
  - Always doubles (4 players)
  - Duration: 1.5 hours
  - One game per player per day (strict)
  - First player listed brings balls

---

## 4. Season Setup Workflow

### Step 1: Establish Season Dates
- **Input:** Start date (must be Monday)
- **Output:** 36-week calendar generated

### Step 2: Mark Holidays
- **Input:** Individual dates via calendar picker
- **Effect:** Games on holiday dates show "Holiday" instead of player names

### Step 3: Establish Makeup Weeks
- **When:** After player assignments complete
- **Input:** Decision to add 1-2 weeks
- **Effect:** Extends season with auto-generated games
- **Special:** Can blank individual makeup games if not needed

### Step 4: Define Court Schedule
- **Screen:** Separate court schedule entry
- **Columns:** Day of week, Court#, Start time, Group flag
- **Entry:** Manual row-by-row (~14 slots)
- **Editable:** Yes, changes can trigger regeneration

### Step 5: Generate Master Game List
- **Trigger:** Manual "Generate games" button
- **Process:** Creates game entry for each court slot × each week
- **Assignment:** Week numbers, game numbers, dates, times
- **Holidays:** Games marked but still listed

### Step 6: Manual Player Assignment
*(See Section 5)*

### Step 7: Generate Reports
*(See Section 8)*

---

## 5. Player Assignment Workflow

### 5.1 Don's Group Assignment

**View: Weekly Assignment Screen**
- Display all games for selected week
- Sorted by: Day → Time → Court#
- Shows: Game#, Date, Day, Time, Court#, 4 player slots (filled/empty)
- Navigation: Scroll to any week, auto-advance when week complete
- Focus: Return to last row when switching weeks

**Pre-Fill Button (Auto-Assignment)**
Runs on active week only. Logic:
1. **Single-day-only players (plays 1x/week, only 1 available day)**
   - Assign to best skill-level match on that day
   - If all games empty, assign to first game
   
2. **D-level groups**
   - If exactly 4 D players available for a game: auto-assign
   - If not exactly 4: highlight as constrained

**Pre-filled assignments appear in blue font**

**Manual Assignment**
- Click player slot → popup dropdown below row
- Shows game context above popup
- Dropdown sorted by:
  1. **Constrained players (highlighted, pushed to top)**
     - Limited availability requiring specific day assignment
  2. Players low on games this week (below contracted frequency)
  3. Players low on games YTD (actual vs. expected pace)
  4. 2+ players with quota met (available for extras)
  5. Skill level: A → B → C → D
  6. Within each group: alphabetical by family name

**Dropdown Features**
- Autocomplete: type first letters of family name
- Shows all prefix matches
- "Show excluded players" toggle (resets to off each popup)
  - Displays excluded players grayed out
  - Shows all applicable exclusion reasons (full text)

**Exclusion Logic**
Players excluded from dropdown if:
- On vacation during game date
- Day of week blocked
- Already played a game that same date
- Weekly game limit reached
- Played yesterday (if "no consecutive days" flag set)
- Already assigned to a Solo game that day

**Conflict Warnings (not excluded)**
- "Do not pair with" another player in same game
  - Show warning but allow assignment

**Buttons Available**
- "Pre-fill" - run auto-assignment logic (blue font)
- "Clear pre-fills" - remove only blue assignments
- Right-click game row:
  - "Clear game" - remove all 4 players from game
  - "Blank game" - mark as not used (for makeup weeks)
  - "Restore game" - un-blank a blanked game

**Validation**
- Run manually via button (by week, day, or all)
- Shows errors inline under problematic games
- Errors clear on next validation run
- Checks: all constraint violations, WTD/YTD issues
- Pinpoints: WTD errors to specific weeks
- Flags: YTD totals only (not specific weeks)

**Week Completion**
- When all slots filled: auto-advance to next week
- All weeks remain editable anytime
- Changes trigger automatic YTD/WTD recalculation

### 5.2 Solo Group Assignment

**Process**
1. Don works out assignments on paper
2. Enter all Solo games via bulk entry screen
3. Run validation check
4. Fix errors
5. Finalize

**Bulk Entry Screen**
- Spreadsheet-style table
- Layout: 2-column if space permits, show all weeks at once
- Columns: Week#, Date, Court#, Player 1-4
- Auto-populate: Week#, Date (based on season calendar)
- Court# dropdown: Limited to Solo-flagged court/time slots only
- Player entry: Autocomplete by family name
- Print option: Blank Solo template for Don's planning

**Validation**
- Run manually after bulk entry
- Shows errors individually with specific details
- Checks: same constraints as Don's games + share fulfillment
- No ball balancing until after corrections

---

## 6. Player Matching Rules

### Skill Level Preferences
- **A players:** Play with A, sometimes with B
- **B players:** Play with B, rarely with C
- **C players:** May play with D (when limited D players available)
- **D players:** Play with D or C when necessary

### Mixing Levels
- When mixing required: aim for balanced pairs
  - Examples: 2A + 2B, 2B + 2C, 2C + 2D
  - Avoid: 3A + 1B, 1A + 3C

### Constraint Rules
- **One game per day:** Strict, applies to both groups
- **No consecutive days:** Per-player flag (physical limitations)
- **Blocked weekdays:** Recurring all season
- **Vacation dates:** Specific ranges (end date = first day back)
- **Do not pair with:** Bidirectional relationships (up to 2 per player)
- **Solo games:** Make player unavailable only that specific day for Don's games

---

## 7. Ball-Bringing Management

### Tracking
- Separate counts for Don's and Solo groups
- Target: Each player brings balls ~once every 4 games
- First player listed in game brings balls

### Balancing Process
**When:** Final step after all assignments validated and corrected

**Trigger:** Manual "Balance balls" button

**Logic:**
- Swaps players within same game only
- Moves players low on ball duty to 1st position
- Swaps with player high on ball duty in same game
- Allows 2-3 consecutive ball assignments (acceptable)

**Operations:**
- Separate runs for Don's and Solo groups
- Operates on entire season (all weeks + makeup weeks)
- Shows last balanced date/time
- Allows retry if results unsatisfactory
- Re-balance option after post-balancing changes

---

## 8. Reports & Outputs

### 8.1 Game Schedule PDF

**Filename:** GameSchedule_MMDDYYYY.pdf (auto-generated with date)

**Organization:**
- Week headers (Week 1, Week 2, etc.)
- Within each week: sorted by Day → Time → Court#
- Intermixed Don's and Solo games chronologically
- Solo games appear in orange font
- Continuous game numbering (1 → total games)
- Blanked games don't appear (no gaps in visible sequence)

**Each Game Row:**
- Game number
- Date
- Day of week
- Start time
- Court number
- 4 player names (family name only, add first initial if duplicate)
- Holiday games: show "Holiday" instead of player names

**Format:**
- Header: Filename
- Footer: Last modified date/time, Page number, Save location path
- Preview before save
- Save to last used location

### 8.2 Player Roster PDF

**Filename:** PlayerRoster_MMDDYYYY.pdf (auto-generated with date)

**Content:**
- Active players only
- Columns: First name, Last name, Cell, Email
- Sorted: Alphabetical by family name
- Header/Footer: Details to be specified later (customizable)

**Format:**
- Same header/footer structure as Game Schedule PDF
- Preview before save
- Save to last used location

---

## 9. Player Management

### 9.1 Player Table View
**Display:**
- All defined fields visible as columns
- Sortable columns (click headers)
- Default sort: Family name A→Z
- Show family name only throughout UI

**Editing:**
- All fields editable directly in table
- Add new players via new row
- Active/Inactive flag column

**Features:**
- Sorting capability on all columns
- Checkboxes for blocked weekdays
- Flexible add/remove vacation date ranges
- 2 "do not pair with" fields (autocomplete player IDs)

### 9.2 Season-to-Season Management

**Import from Previous Season:**
- Manual "Import players" button
- Pulls from immediately previous season only
- Imports all player data including frequency selection
- Defaults all to Inactive status

**Activation Checklist:**
- View-only display of imported players
- Shows: Name, Email, Phone, Last frequency
- Batch activate via checkboxes
- Edit player details separately in player table

### 9.3 Replace Player Function
**Access:** Right-click player in table → "Replace in future games"

**Scope:** Today and all future games (based on game date)

**Process:**
1. Select player to replace
2. Right-click → "Replace in future games"
3. Choose replacement from dropdown (all active players)
4. System shows confirmation: "Replaced [Name] in X games"

**Effect:**
- Original player removed from future games
- Replacement assigned to those games
- Past games unchanged

---

## 10. Validation & Error Checking

### When to Validate
- Manual trigger via button
- Scope options: specific week, specific day, or all
- After constraint changes (skill level, no consecutive days, vacation, etc.)
- After Solo bulk entry
- Before finalizing season

### What Gets Checked
**Constraint Violations:**
- Players on vacation
- Blocked weekdays violated
- Consecutive day rule violated (if flagged)
- One-game-per-day rule violated
- "Do not pair with" conflicts (warning only)

**Assignment Balance:**
- WTD: Players under/over contracted frequency
- YTD: Players behind/ahead of expected pace (based on weeks elapsed)
- Share fulfillment (Solo players)

**Skill Level Mismatches:**
- Games with inappropriate level mixing
- Post-change mismatches when player skill level adjusted

### Error Display
- Inline under affected games
- Shows all applicable reasons per error
- Pinpoints WTD errors to specific weeks
- Flags YTD totals (not specific weeks)
- Errors clear on next validation run

---

## 11. User Interface Requirements

### General Principles
- Family name display throughout (add first initial for duplicates)
- Minimal clicks to common actions
- Clear visual feedback (blue pre-fills, orange Solo games)
- Right-click context menus for game operations
- Autocomplete for player entry

### Screen Organization
**Separate screens for:**
1. Season dates setup
2. Holiday entry (calendar picker)
3. Court schedule entry
4. Player table management
5. Player activation checklist
6. Weekly assignment view (Don's games)
7. Solo bulk entry
8. PDF generation/preview

### Assignment View Specifics
- Single scrollable list per week
- Shows all games (filled/empty)
- Color coding: Blue (pre-fill), Orange (Solo), Default (normal)
- Popup dropdown positioned below current row
- Focus maintenance across week navigation
- Clear visual distinction for excluded players in dropdown

### Buttons & Actions
- "Generate games" (after court setup)
- "Pre-fill" (constrained auto-assignment)
- "Clear pre-fills" (remove blue only)
- "Validate" (check errors)
- "Balance balls" (final step)
- "Import players" (from previous season)
- "Print blank Solo template"
- "Preview PDF" → "Save PDF"
- Right-click: Clear game, Blank game, Restore game, Replace player

---

## 12. Technical Considerations

### Data Persistence
- SQLite database (single file)
- Store complete season data
- Track changes for last modified timestamps
- Maintain separate ball counts per group

### Automatic Calculations
- YTD/WTD counts recalculate on any assignment change
- Week number and date generation from start date
- Game number assignment (sequential, permanent)
- Expected YTD pace calculation (actual vs. target at current week)

### Performance
- ~40 players, 36 weeks, ~14 games/week = ~500 total games
- Real-time dropdown filtering and sorting
- Instant validation feedback
- PDF generation within seconds

### Future Considerations (Low Priority)
- Player read-only web access to schedules
- Remote internet access (beyond local network)
- Import/export player data (CSV)
- Historical season data archival
- Email distribution of PDFs
- Customizable report headers/footers

---

## 13. What's NOT Included (Out of Scope)

### Initial Release Excludes:
- Player login/authentication
- Player self-service schedule viewing
- Automated email notifications
- Payment/billing tracking
- Court reservation management
- Weather cancellation workflow details (marked for later discussion)
- Score tracking or match results
- Player ranking system
- Automated skill level adjustments
- Mobile app versions
- Multi-administrator access
- Cloud hosting/backup
- Integration with external calendar systems

---

## 14. Open Items for Future Discussion

### Items Marked "Details Later":
1. **Report headers/footers:** Specific customizable content (changes year to year)
2. **Weather cancellation workflow:** How makeup week decisions get triggered
3. **Player import/export:** CSV functionality for bulk operations
4. **Advanced validation:** Suggestions for resolving complex conflicts
5. **Remote access setup:** Specific method (port forwarding, VPN, etc.)
6. **Backup strategy:** Automated database backups
7. **Historical data:** Whether to archive past seasons or purge

### Known Edge Cases to Address:
- What happens when no valid player assignments exist for a game?
- How to handle last-minute player withdrawals after season starts?
- Procedure for mid-season court schedule changes (force majeure)
- Protocol when "do not pair" conflicts block all available players
- Handling players who exceed 2+ limit (how many extras is too many?)

---

## 15. Success Criteria

### Must Have (Version 1.0):
✓ Generate complete 36-week game schedule  
✓ Enforce all player constraints (vacation, blocked days, skill level)  
✓ Intelligent dropdown filtering and sorting  
✓ Pre-fill constrained assignments  
✓ Validate assignments against all rules  
✓ Balance ball-bringing duties  
✓ Generate professional PDF reports (schedule + roster)  
✓ Support both Don's and Solo groups  
✓ Import players from previous season  
✓ Replace players mid-season  

### Definition of Done:
- Rudor can set up entire season in < 1 hour
- Weekly assignments completable in < 30 minutes
- Zero manual constraint checking required
- PDFs ready for immediate distribution
- All validations catch rule violations
- System runs reliably on macOS without technical support

---

## 16. Timeline & Approach

### Development Strategy: AI-Assisted "Vibe Coding"
- Leverage AI tools (Claude, Cursor, GitHub Copilot) for code generation
- Iterative development with frequent testing
- Focus on working features over perfect code
- Rudor validates each feature against real-world usage

### Suggested Phase Breakdown:

**Phase 1: Foundation**
- Database schema setup
- Basic player CRUD
- Season setup screens

**Phase 2: Core Scheduling**
- Game generation
- Weekly assignment view
- Manual player assignment with dropdown

**Phase 3: Intelligence Layer**
- Pre-fill logic
- Validation engine
- Constraint checking

**Phase 4: Polish**
- Ball balancing
- PDF generation
- Solo group support

**Phase 5: Refinement**
- Error handling
- UI improvements
- Testing with real data

---

## 17. Questions for Consultation (With Son)

1. **Technology stack confirmation:**
   - Python + Flask + SQLite acceptable?
   - Alternative preferences?

2. **Hosting approach:**
   - Run as local server on Mac?
   - Docker container?
   - Different deployment strategy?

3. **Development environment:**
   - Text editor preferences (VS Code, Cursor, PyCharm)?
   - AI coding assistant recommendations?
   - Version control setup (Git)?

4. **Database design:**
   - Review proposed schema
   - Normalization vs. denormalization tradeoffs
   - Indexing strategy for performance

5. **Future scalability:**
   - Multi-season data management
   - Potential for multi-club usage
   - Cloud migration path

---

## Document History

**Version 1.0 - February 8, 2026**
- Initial comprehensive PRD
- Captured requirements from discovery conversation
- Ready for technical review and development planning

---

## Appendix: Quick Reference

### Player Constraints Summary
- Frequency: 1, 2, 2+
- Skill: A, B, C, D
- Blocked weekdays (recurring)
- Vacation dates (ranges)
- No consecutive days (flag)
- Do not pair with (2 max)
- Solo share (if applicable)

### Dropdown Sort Priority
1. Constrained (highlighted)
2. Low this week
3. Low YTD
4. 2+ extras available
5. Skill level A→D
6. Alphabetical by name

### Game Status Types
- Normal (assigned players)
- Holiday (shows "Holiday")
- Blanked (doesn't appear in PDF)

### Key Validation Rules
- One game per player per day
- No consecutive days (if flagged)
- Respect vacations and blocked days
- Enforce "do not pair" (warning)
- Balance YTD vs. expected pace
- Skill level appropriateness

---

**END OF DOCUMENT**