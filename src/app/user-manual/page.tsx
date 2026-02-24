"use client";

// User Manual for Tennis Scheduler
// Keep in sync with feature changes across the application.

const tocSections = [
  { id: "overview", label: "Overview" },
  { id: "getting-started", label: "Getting Started" },
  { id: "season-setup", label: "Season Setup" },
  { id: "court-schedule", label: "Court Schedule" },
  { id: "players", label: "Players" },
  { id: "schedule", label: "Schedule" },
  { id: "auto-assign-dons", label: "Auto-Assign: Don\u2019s Algorithm" },
  { id: "auto-assign-solo", label: "Auto-Assign: Solo Algorithm" },
  { id: "ball-balancing", label: "Ball Balancing" },
  { id: "compliance", label: "Compliance Checking" },
  { id: "reports", label: "Reports" },
  { id: "communications", label: "Communications" },
  { id: "backup", label: "Backup & Restore" },
  { id: "tips", label: "Tips & Troubleshooting" },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export default function UserManualPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">User Manual</h1>

      <div className="flex gap-8">
        {/* Table of Contents - sticky sidebar */}
        <nav className="sticky top-4 self-start w-48 shrink-0 border-r border-border pr-4">
          <div className="text-sm font-semibold mb-3 text-muted">Contents</div>
          <ul className="space-y-2">
            {tocSections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollTo(s.id);
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* ===== OVERVIEW ===== */}
          <section id="overview" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Overview</h2>
              <p className="text-sm leading-relaxed mb-3">
                Tennis Scheduler is a web application for managing a tennis club&apos;s seasonal
                player assignments across a 36-week season (expandable with makeup weeks). It
                handles court scheduling, player management with availability constraints, automatic
                game generation, manual and automatic player assignments, compliance checking,
                ball-bringing duty balancing, PDF report generation, email communications, and
                full database backup.
              </p>
              <p className="text-sm leading-relaxed mb-3">
                The application manages two independent player groups:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-3">
                <li>
                  <span className="font-semibold">Don&apos;s Group</span> &mdash; The primary group
                  of contracted players who play on a regular weekly schedule. Players have contracted
                  frequencies (1x, 2x, or 2+ per week) and skill levels (A, B, C, D).
                </li>
                <li>
                  <span className="font-semibold">Solo Group</span> &mdash; Players with specific
                  share levels (Full or Half) who play on designated Solo courts. Half-share players
                  are paired and alternate odd/even weeks.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mb-3">
                Each game has 4 player slots. Player 1 (the first slot) is responsible for bringing
                new balls to the game.
              </p>
              <p className="text-sm leading-relaxed">
                The app is deployed online (Vercel + Turso cloud database) and is protected by a
                site-wide password.
              </p>
            </div>
          </section>

          {/* ===== GETTING STARTED ===== */}
          <section id="getting-started" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Getting Started</h2>
              <p className="text-sm leading-relaxed mb-3">
                Follow these steps in order when setting up a new season. Each step depends on the
                previous one being completed first.
              </p>
              <ol className="list-decimal list-inside space-y-2 text-sm ml-4">
                <li>
                  <span className="font-semibold">Create a Season</span> &mdash; Go to{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Season Setup
                  </span>{" "}
                  and set the season start date (must be a Monday). Configure the derated pairing
                  frequency.
                </li>
                <li>
                  <span className="font-semibold">Define Court Slots</span> &mdash; Go to{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Court Schedule
                  </span>{" "}
                  and add the weekly recurring court times, marking each as Don&apos;s or Solo group.
                </li>
                <li>
                  <span className="font-semibold">Add Holidays</span> &mdash; On the Season Setup
                  page, add any holiday dates. Use the Quick Add dropdown for common US holidays, or
                  enter custom dates.
                </li>
                <li>
                  <span className="font-semibold">Add Players</span> &mdash; Go to{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Players
                  </span>{" "}
                  and add all players with their contracted frequency, skill level, and availability
                  constraints. You can also use CSV import (simple 5-column format or full backup
                  restore).
                </li>
                <li>
                  <span className="font-semibold">Generate Games</span> &mdash; On the{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Season Setup
                  </span>{" "}
                  page, click &ldquo;Generate Games&rdquo; to create game slots for all weeks based
                  on the court schedule.
                </li>
                <li>
                  <span className="font-semibold">Auto-Assign Solo Games</span> &mdash; On the
                  Season Setup page, click &ldquo;Auto-Assign Solo&rdquo; to fill all Solo game slots
                  for the entire season.
                </li>
                <li>
                  <span className="font-semibold">Auto-Assign Don&apos;s Games</span> &mdash; On the
                  Season Setup page, click &ldquo;Auto-Assign Don&apos;s&rdquo; to fill all Don&apos;s
                  game slots for the entire season. Solo games must be assigned first.
                </li>
                <li>
                  <span className="font-semibold">Review &amp; Adjust</span> &mdash; Go to the{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Schedule
                  </span>{" "}
                  page to review each week, make manual adjustments, and run compliance checks.
                </li>
                <li>
                  <span className="font-semibold">Balance Balls</span> &mdash; On the Season Setup
                  page, use &ldquo;Balance Solo Balls&rdquo; and &ldquo;Balance Don&apos;s Balls&rdquo;
                  season-wide. Or use per-week ball balancing on the Schedule page.
                </li>
                <li>
                  <span className="font-semibold">Generate Reports</span> &mdash; Go to{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Reports
                  </span>{" "}
                  to produce PDF schedules, statistics, pairing matrix, and player lists.
                </li>
              </ol>
            </div>
          </section>

          {/* ===== SEASON SETUP ===== */}
          <section id="season-setup" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Season Setup</h2>

              <h3 className="font-semibold mb-2">Creating a Season</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  The season start date <span className="font-semibold">must be a Monday</span>.
                  The system validates this automatically.
                </li>
                <li>
                  The season spans <span className="font-semibold">36 weeks</span> by default. The end
                  date is calculated automatically. Makeup weeks can extend the season beyond 36.
                </li>
                <li>
                  Only one season can be active at a time. Click{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Create Season
                  </span>{" "}
                  for a new season or{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Update Season
                  </span>{" "}
                  to change the start date.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Derated Pairing Frequency</h3>
              <p className="text-sm leading-relaxed mb-2">
                Controls how often a derated player can be paired with the same non-derated player:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li><span className="font-semibold">No limit</span> &mdash; No restriction.</li>
                <li><span className="font-semibold">Once per week</span> &mdash; A non-derated player can only play with the same derated player once per week.</li>
                <li><span className="font-semibold">Once per two weeks</span> &mdash; Same restriction but spanning two consecutive weeks.</li>
              </ul>

              <h3 className="font-semibold mb-2">Managing Holidays</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Add holiday dates that fall within the season. Games on these dates will
                  automatically be marked as &ldquo;Holiday&rdquo; status when games are generated.
                </li>
                <li>
                  Use the <span className="font-semibold">Quick Add</span> dropdown to add common US
                  holidays (Memorial Day, Thanksgiving, etc.) that fall within the season dates.
                  Holidays already added are filtered out.
                </li>
                <li>
                  Holiday games cannot have player assignments &mdash; they appear with an amber
                  background on the Schedule page. You can also toggle holidays directly from the
                  Schedule page.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Generating &amp; Regenerating Games</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Click <span className="font-semibold">Generate Games</span> to create game slots for
                  all weeks. Each court slot produces one game per week.
                </li>
                <li>
                  If games already exist, the button becomes <span className="font-semibold">Regenerate
                  Games</span> and requires confirmation. Regenerating deletes all existing games
                  and player assignments.
                </li>
                <li>
                  Games are numbered sequentially across the entire season.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Makeup Weeks</h3>
              <p className="text-sm leading-relaxed mb-4">
                Click <span className="font-semibold">Add Makeup Week</span> to extend the season by
                one week. This creates new game slots without affecting existing assignments. Useful
                for making up holidays or weather cancellations. Games are created but not
                auto-assigned.
              </p>

              <h3 className="font-semibold mb-2">Bulk Operations</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Auto-Assign Solo</span> &mdash; Fills all Solo game
                  slots for the entire season. Must be run before Don&apos;s auto-assign.
                </li>
                <li>
                  <span className="font-semibold">Auto-Assign Don&apos;s</span> &mdash; Fills all
                  Don&apos;s game slots for the entire season. Weeks that already have assignments are
                  skipped.
                </li>
                <li>
                  <span className="font-semibold">Balance Solo Balls / Balance Don&apos;s Balls</span>{" "}
                  &mdash; Rebalances ball-bringing duty across the entire season for each group.
                </li>
                <li>
                  <span className="font-semibold">Clear Solo/Don&apos;s/All Assignments</span>{" "}
                  &mdash; Removes player assignments without deleting games. Each has a confirmation
                  prompt.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Resetting the Season</h3>
              <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm mb-4">
                <span className="font-semibold">Warning:</span> Resetting the season permanently
                deletes <span className="font-semibold">everything</span> &mdash; the season,
                all holidays, games, and player assignments. Players and court schedules are preserved.
                You must type{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">DELETE</span>{" "}
                to confirm. A backup ZIP is automatically downloaded before the reset proceeds.
              </div>

              <h3 className="font-semibold mb-2">Download Backup</h3>
              <p className="text-sm leading-relaxed">
                Click <span className="font-semibold">Download Backup</span> at any time to download
                a ZIP file containing CSV exports of all 14 database tables. This works in both
                development and production environments.
              </p>
            </div>
          </section>

          {/* ===== COURT SCHEDULE ===== */}
          <section id="court-schedule" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Court Schedule</h2>
              <p className="text-sm leading-relaxed mb-3">
                Court slots define the weekly recurring game times. Each slot repeats every week for
                the full season when games are generated.
              </p>

              <h3 className="font-semibold mb-2">Adding Court Slots</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Day of Week</span> &mdash; Which day the court is
                  scheduled (Sunday through Saturday).
                </li>
                <li>
                  <span className="font-semibold">Court Number</span> &mdash; Courts are numbered 1
                  through 6.
                </li>
                <li>
                  <span className="font-semibold">Start Time</span> &mdash; The game start time.
                </li>
                <li>
                  <span className="font-semibold">Solo Group</span> &mdash; Check this box if the
                  court is designated for Solo group players. Unchecked means Don&apos;s group.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mb-3">
                The system prevents duplicate court slots (same day, time, and court number). Slots
                can be edited or deleted at any time. The table displays all slots sorted by
                day, then time, then court number.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 text-sm">
                <span className="font-semibold">Tip:</span> Define all court slots before generating
                games. If you add new slots after game generation, you will need to regenerate games
                (which removes all existing assignments).
              </div>
            </div>
          </section>

          {/* ===== PLAYERS ===== */}
          <section id="players" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Players</h2>

              <h3 className="font-semibold mb-2">Player Attributes</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">First Name / Last Name</span> &mdash; Required.
                </li>
                <li>
                  <span className="font-semibold">Contact Info</span> &mdash; Cell phone, home
                  phone, and email address (all optional). Used in the Players List report and
                  email communications.
                </li>
                <li>
                  <span className="font-semibold">Contracted Frequency</span>:
                  <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                    <li>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Sub</span>{" "}
                      &mdash; Substitute player, 0 games per week
                    </li>
                    <li>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">1x/week</span>{" "}
                      &mdash; One game per week
                    </li>
                    <li>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">2x/week</span>{" "}
                      &mdash; Two games per week
                    </li>
                    <li>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">2+/week</span>{" "}
                      &mdash; Two or more games per week (eligible for bonus games)
                    </li>
                  </ul>
                </li>
                <li>
                  <span className="font-semibold">Skill Level</span> &mdash; A (highest), B, C, or
                  D. Used in auto-assign game composition and bonus-mode sorting.
                </li>
                <li>
                  <span className="font-semibold">Solo Share Level</span> &mdash; None (not in Solo),
                  Full, or Half. Half-share players must be paired with another half-share player to
                  alternate weeks.
                </li>
                <li>
                  <span className="font-semibold">Active</span> &mdash; Inactive players are
                  excluded from assignment dropdowns and auto-assign.
                </li>
                <li>
                  <span className="font-semibold">No Consecutive Days</span> &mdash; Prevents
                  scheduling on back-to-back calendar days.
                </li>
                <li>
                  <span className="font-semibold">Derated</span> &mdash; Marks the player for
                  derated pairing limits (see Season Setup &gt; Derated Pairing Frequency).
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Blocked Days</h3>
              <p className="text-sm leading-relaxed mb-4">
                Check any day of the week when the player is permanently unavailable. The assignment
                dropdown and auto-assign will automatically exclude the player from games on blocked
                days.
              </p>

              <h3 className="font-semibold mb-2">Vacations</h3>
              <p className="text-sm leading-relaxed mb-4">
                Add one or more vacation ranges with a start date and last day (inclusive). Players on
                vacation are excluded from assignment and auto-assign for games during those dates.
              </p>

              <h3 className="font-semibold mb-2">Does Not Play With</h3>
              <p className="text-sm leading-relaxed mb-4">
                Select players who should not be paired in the same game. The Schedule page enforces
                this bidirectionally &mdash; adding Player B to Player A&apos;s list also prevents
                the reverse. The compliance checker flags violations, and auto-assign respects these
                constraints.
              </p>

              <h3 className="font-semibold mb-2">Solo Pair Partner</h3>
              <p className="text-sm leading-relaxed mb-4">
                Half-share Solo players must be paired. The pair alternates odd/even weeks: Player A
                (lower ID) plays odd weeks, Player B plays even weeks. If the designated player is
                unavailable (blocked day or vacation), the partner fills in as a fallback.
              </p>

              <h3 className="font-semibold mb-2">CSV Import &amp; Export</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Simple format</span> (5 columns: Last Name, First
                  Name, Cell, Home, Email) &mdash; imports contact info only. New players default to
                  Active, 1x/week, Skill C.
                </li>
                <li>
                  <span className="font-semibold">Full backup format</span> (15 columns including
                  Skill, Frequency, Solo Share, Active, Derated, Blocked Days, Vacations, Does Not
                  Play With) &mdash; detected automatically. Restores all player settings.
                </li>
                <li>
                  Rows with names like &ldquo;HOLIDAY&rdquo;, &ldquo;GAME&rdquo;, &ldquo;TBD&rdquo;,
                  or &ldquo;OPEN&rdquo; are ignored.
                </li>
                <li>
                  A preview dialog shows all players to import with New/Update badges before
                  committing.
                </li>
                <li>
                  <span className="font-semibold">Export CSV</span> saves a full 15-column backup
                  file to the server&apos;s Backup directory.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Player Table</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                <li>
                  Click column headers to sort by Last Name, First Name, Skill Level, or Frequency.
                  Click again to reverse sort.
                </li>
                <li>
                  Use <span className="font-semibold">Show Inactive</span> toggle to include inactive
                  players (shown at 50% opacity).
                </li>
                <li>
                  Click a player&apos;s last name or the Edit link to open the edit form. Delete
                  requires typing the player&apos;s full name to confirm.
                </li>
                <li>
                  Footer shows active / inactive / total player counts.
                </li>
              </ul>
            </div>
          </section>

          {/* ===== SCHEDULE ===== */}
          <section id="schedule" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Schedule</h2>
              <p className="text-sm leading-relaxed mb-4">
                The Schedule page is the main workspace for viewing and editing player assignments
                week by week.
              </p>

              <h3 className="font-semibold mb-2">Week Navigation</h3>
              <p className="text-sm leading-relaxed mb-4">
                Use First / Prev / Next buttons or the week dropdown to navigate. Your current week
                position is remembered across page reloads. The header shows game counts for the
                current week and season total.
              </p>

              <h3 className="font-semibold mb-2">Game Table</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>Games are grouped by date with date headers.</li>
                <li>Columns: #, Time, Court, Group, Player 1 (ball bringer), Player 2, Player 3, Player 4.</li>
                <li>Derated players show an orange <span className="font-semibold">D</span> marker.</li>
                <li>Pre-fill assignments are shown in blue text.</li>
                <li>
                  <span className="font-semibold">Normal</span> games have white/tan backgrounds.{" "}
                  <span className="font-semibold">Holiday</span> games have amber backgrounds.{" "}
                  <span className="font-semibold">Blanked</span> games are grayed out.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Toggling Holidays</h3>
              <p className="text-sm leading-relaxed mb-4">
                Click the <span className="font-semibold">+ Holiday</span> button on any date header
                to mark all games on that date as holiday (you can optionally name the holiday).
                This clears any existing assignments. Click the holiday badge to restore games to
                normal status.
              </p>

              <h3 className="font-semibold mb-2">Assigning Players Manually</h3>
              <p className="text-sm leading-relaxed mb-2">
                Click any empty player slot to open the assignment dropdown. The dropdown intelligently
                sorts and filters available players:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-3">
                <li>
                  <span className="font-semibold text-red-600">MUST</span> &mdash; Players who have
                  only one remaining playable day this week and still owe games. Assign these first.
                </li>
                <li>
                  Players are sorted by games owed this week (WTD), then YTD deficit, then alphabetically.
                  You can toggle between Owed and YTD sort modes.
                </li>
                <li>
                  <span className="font-semibold">Subs</span> appear in a separate purple section,
                  sorted by skill level.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mb-4">
                Players are excluded from the dropdown if they: are already in this game, are already
                assigned on the same day, are on vacation, have a blocked day, have a do-not-pair
                conflict, or exceed the derated pairing cap.
              </p>

              <h3 className="font-semibold mb-2">Auto-Assign (Per Week)</h3>
              <p className="text-sm leading-relaxed mb-4">
                Click <span className="font-semibold">Auto-Assign</span> on the Schedule page to
                automatically fill Don&apos;s game slots for the current week. This runs the same
                algorithm described in detail below. Solo games must be fully assigned first.
                After completion, an Auto-Assign Report shows the log of assignments and any warnings.
                Use <span className="font-semibold">Clear Don&apos;s</span> to remove Don&apos;s
                assignments for the week.
              </p>

              <h3 className="font-semibold mb-2">Player Info Panel</h3>
              <p className="text-sm leading-relaxed mb-4">
                Click <span className="font-semibold">Player Info</span> to toggle a compact card
                grid showing all Don&apos;s group players with their: contracted frequency, WTD owed
                (green = owes games), YTD owed, blocked days, and a red &ldquo;V&rdquo; if on
                vacation this week.
              </p>

              <h3 className="font-semibold mb-2">Bonus Mode</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Bonus</span> &mdash; Activates after all contracted
                  1x/2x players meet their weekly quota. Shows 2+ frequency players in the dropdown
                  with a green &ldquo;BONUS&rdquo; label.
                </li>
                <li>
                  <span className="font-semibold">Bonus All</span> &mdash; Shows all available
                  players as bonus options regardless of quota. Useful for filling remaining empty
                  slots.
                </li>
                <li>The two modes are mutually exclusive.</li>
              </ul>

              <h3 className="font-semibold mb-2">Extra Games Display</h3>
              <p className="text-sm leading-relaxed">
                Click <span className="font-semibold">Display Extra</span> to see all instances
                where a 2+ player has been assigned extra games beyond their contracted frequency.
                This can be exported as a PDF report.
              </p>
            </div>
          </section>

          {/* ===== AUTO-ASSIGN: DON'S ALGORITHM ===== */}
          <section id="auto-assign-dons" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Auto-Assign: Don&apos;s Group Algorithm</h2>
              <p className="text-sm leading-relaxed mb-4">
                The Don&apos;s auto-assign algorithm fills all Don&apos;s game slots for a given week.
                It can be run per-week from the Schedule page, or for all weeks at once from the
                Season Setup page. When run for all weeks, each week is processed sequentially so
                YTD counts accumulate naturally.
              </p>

              <h3 className="font-semibold mb-2">Prerequisites</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>All Solo games for the week must be fully assigned (4 players each).</li>
                <li>No Don&apos;s game in the week can have existing assignments.</li>
                <li>When running all weeks, weeks that already have Don&apos;s assignments are skipped.</li>
              </ul>

              <h3 className="font-semibold mb-2">Step 1: Load Data</h3>
              <p className="text-sm leading-relaxed mb-4">
                The algorithm loads all games for the week with their assignments, all active
                contracted players (frequency &ne; Sub) with their blocked days, vacations, and
                do-not-pair lists, and cumulative YTD assignment counts through the current week.
              </p>

              <h3 className="font-semibold mb-2">Step 2: Build Availability Maps</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Solo exclusion</span> &mdash; Players already
                  assigned to a Solo game on a given date are excluded from Don&apos;s games on that
                  same date (one game per day rule).
                </li>
                <li>
                  <span className="font-semibold">Derated pairing history</span> &mdash; If the season
                  has a &ldquo;once per two weeks&rdquo; derated cap, the previous week&apos;s games
                  are also loaded to check cross-week derated pairings.
                </li>
                <li>
                  <span className="font-semibold">Per-day surplus check</span> &mdash; For each day
                  with games, the algorithm counts eligible players vs. slots needed and logs warnings
                  if a day is tight.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Step 3: Player Filtering</h3>
              <p className="text-sm leading-relaxed mb-2">
                For each game slot, the algorithm determines available players by checking:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm ml-4 mb-4">
                <li>Not already in this game</li>
                <li>Not already assigned to another game on the same date (including Solo)</li>
                <li>Still owes games this week (WTD frequency &minus; games assigned &gt; 0), or is a 2+ player</li>
                <li>Not on a blocked day of the week</li>
                <li>Not on vacation during the game date</li>
                <li>No consecutive days conflict (if flagged &mdash; checks day before and day after)</li>
                <li>No do-not-pair conflict with any player already assigned to this game (bidirectional)</li>
                <li>Derated pairing cap not exceeded (checks same-week and optionally previous-week pairings)</li>
              </ol>

              <h3 className="font-semibold mb-2">Step 4: Player Priority Scoring</h3>
              <p className="text-sm leading-relaxed mb-2">
                Each eligible player receives a priority score used for sorting:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Must Play</span> (highest priority) &mdash; The
                  player still owes games AND this is their only remaining playable day this week.
                </li>
                <li>
                  <span className="font-semibold">Games Owed</span> &mdash; Higher owed count =
                  higher priority (frequency &minus; WTD count).
                </li>
                <li>
                  <span className="font-semibold">Playable Days Left</span> &mdash; Fewer remaining
                  options = higher priority (most constrained players assigned first).
                </li>
                <li>
                  <span className="font-semibold">YTD Deficit</span> &mdash; Higher deficit =
                  higher priority (expected games &minus; actual YTD count).
                </li>
                <li>
                  <span className="font-semibold">Alphabetical</span> &mdash; Last name as
                  tiebreaker.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Step 5: Day Ordering (Tightest First)</h3>
              <p className="text-sm leading-relaxed mb-4">
                Days are processed in order of <span className="font-semibold">tightest surplus
                first</span> &mdash; the day with the smallest difference between available players
                and slots needed is assigned first. This ensures scarce 2+ players are allocated
                where most needed before less constrained days.
              </p>

              <h3 className="font-semibold mb-2">Step 6: Game Composition Planning</h3>
              <p className="text-sm leading-relaxed mb-2">
                For each day, the algorithm plans game compositions based on skill levels:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">C-only games</span> &mdash; Groups of 4 C-level
                  players (when enough C players owe games).
                </li>
                <li>
                  <span className="font-semibold">Mixed games</span> &mdash; 2 C players + 2 B
                  players, or 1 C + 3 B for odd remainders.
                </li>
                <li>
                  <span className="font-semibold">A/B games</span> &mdash; Remaining games filled
                  with A and B level players. C players are blocked from A-level pairings; A
                  players are blocked from mixed games containing C players.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Step 7: Three-Pass Assignment</h3>
              <p className="text-sm leading-relaxed mb-2">
                For each game slot, the algorithm runs three passes to fill all 4 positions:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">First-game-only pass</span> &mdash; Only considers
                  players who have not yet played this week (WTD = 0). This spreads assignments
                  across the most players possible.
                </li>
                <li>
                  <span className="font-semibold">All-owed pass</span> &mdash; Expands to any player
                  who still owes games or is a 2+ player.
                </li>
                <li>
                  <span className="font-semibold">Bonus pass</span> &mdash; Allows 2+ frequency
                  players to take a bonus game on the same day (overrides the one-per-day rule for 2+
                  players only).
                </li>
              </ol>

              <h3 className="font-semibold mb-2">Step 8: Summary</h3>
              <p className="text-sm leading-relaxed">
                After processing all games, the algorithm reports total slots filled, unfilled slots,
                and a per-day log of warnings (tight pools, unfilled positions, do-not-pair
                constraints, etc.).
              </p>
            </div>
          </section>

          {/* ===== AUTO-ASSIGN: SOLO ALGORITHM ===== */}
          <section id="auto-assign-solo" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Auto-Assign: Solo Group Algorithm</h2>
              <p className="text-sm leading-relaxed mb-4">
                The Solo auto-assign algorithm fills all Solo game slots for the entire season in a
                single operation. It must be run before Don&apos;s auto-assign because the Don&apos;s
                algorithm needs to know which players are already assigned to Solo games each day.
              </p>

              <h3 className="font-semibold mb-2">Prerequisites</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>No Solo assignments can exist (clear first if needed).</li>
                <li>All half-share players should be paired via the Players page.</li>
              </ul>

              <h3 className="font-semibold mb-2">Step 1: Load Solo Players</h3>
              <p className="text-sm leading-relaxed mb-4">
                Loads all active players with a Solo share level (Full or Half). For each, loads
                their blocked days, vacations, do-not-pair list, and solo pair partner.
              </p>

              <h3 className="font-semibold mb-2">Step 2: Validate Half-Share Pairings</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Each half-share player must be paired with another half-share player. Unpaired
                  half-share players are skipped with a warning.
                </li>
                <li>
                  Unique pairs are identified (lower ID = Player A, higher ID = Player B).
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Step 3: Seeded Random Shuffling</h3>
              <p className="text-sm leading-relaxed mb-4">
                The algorithm uses a <span className="font-semibold">seeded random number
                generator</span> (based on the season ID) with a Fisher-Yates shuffle. This ensures
                reproducible but varied ordering &mdash; running auto-assign on the same season
                always produces the same result.
              </p>

              <h3 className="font-semibold mb-2">Step 4: Week-by-Week Processing</h3>
              <p className="text-sm leading-relaxed mb-2">
                Games are grouped by week. For each week, the algorithm determines who is eligible:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Full-share players</span> &mdash; Always included
                  every week.
                </li>
                <li>
                  <span className="font-semibold">Half-share pairs</span> &mdash; Odd weeks: Player A
                  is designated. Even weeks: Player B is designated. If the designated player is fully
                  blocked or on vacation for every game day that week, the partner is used as a
                  fallback. If both are unavailable, the pair is skipped with a warning.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Step 5: Game-by-Game Slot Filling</h3>
              <p className="text-sm leading-relaxed mb-2">
                For each game in the week (sorted by day, time, court), for each of the 4 player
                slots, the algorithm:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Filters eligible players by: not already in this game, not already assigned on this
                  date, not on a blocked day, not on vacation, no do-not-pair conflict with any
                  player already in the game.
                </li>
                <li>
                  Shuffles candidates using the seeded RNG.
                </li>
                <li>
                  Stable-sorts by <span className="font-semibold">deficit</span> descending: (share
                  level frequency &times; current week) &minus; actual assignments so far. Players
                  who are most behind their expected pace play first.
                </li>
                <li>
                  Assigns the top candidate and updates their assignment count and date tracking.
                </li>
              </ol>

              <h3 className="font-semibold mb-2">Step 6: Summary</h3>
              <p className="text-sm leading-relaxed">
                Reports total Solo slots filled vs. unfilled across the entire season, with per-week
                warnings for any slots that could not be filled due to constraints.
              </p>
            </div>
          </section>

          {/* ===== BALL BALANCING ===== */}
          <section id="ball-balancing" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Ball Balancing</h2>
              <p className="text-sm leading-relaxed mb-4">
                Player 1 in each game brings new balls. The ball balancing feature redistributes
                slot positions within each game so that ball-bringing duty is spread evenly. Each
                player should bring balls for approximately 1/4 of their games.
              </p>

              <h3 className="font-semibold mb-2">How It Works</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Considers only fully-assigned games (all 4 slots filled) with &ldquo;normal&rdquo;
                  status.
                </li>
                <li>
                  Counts each player&apos;s total games in the group (season-wide) and computes their{" "}
                  <span className="font-semibold">expected balls</span> = round(total games / 4).
                </li>
                <li>
                  Runs up to 10 iterative passes. In each pass, for each game, finds the player with
                  the lowest (actual &minus; expected) delta and swaps them into the slot 1 (ball
                  bringer) position if it reduces overall imbalance.
                </li>
                <li>
                  Stops early after 2 consecutive passes with no improvement.
                </li>
              </ol>

              <h3 className="font-semibold mb-2">Where to Run It</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Season-wide</span> (Season Setup page): &ldquo;Balance
                  Solo Balls&rdquo; and &ldquo;Balance Don&apos;s Balls&rdquo; buttons. These apply
                  changes immediately and show a per-player summary table.
                </li>
                <li>
                  <span className="font-semibold">Per-week</span> (Schedule page): &ldquo;Balls
                  Don&apos;s&rdquo; button. This shows a preview of proposed swaps with an
                  &ldquo;Apply Swaps&rdquo; button to confirm.
                </li>
              </ul>
              <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 text-sm">
                <span className="font-semibold">Tip:</span> Run ball balancing after all player
                assignments are complete, so the algorithm has the most data to work with.
              </div>
            </div>
          </section>

          {/* ===== COMPLIANCE CHECKING ===== */}
          <section id="compliance" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Compliance Checking</h2>
              <p className="text-sm leading-relaxed mb-2">
                Click <span className="font-semibold">Don&apos;s Compliance</span> or{" "}
                <span className="font-semibold">Solo Compliance</span> on the Schedule page to
                validate all assignments for the current week. The checker verifies 14 rules:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm ml-4 mb-3">
                <li>
                  <span className="font-semibold">One game per day</span> (error) &mdash; Player
                  assigned to multiple games on the same date.
                </li>
                <li>
                  <span className="font-semibold">Vacation conflict</span> (error) &mdash; Player
                  assigned during their vacation.
                </li>
                <li>
                  <span className="font-semibold">Blocked day</span> (error) &mdash; Player assigned
                  on a day they have blocked.
                </li>
                <li>
                  <span className="font-semibold">Inactive player</span> (warning) &mdash; An
                  inactive player is assigned.
                </li>
                <li>
                  <span className="font-semibold">Over contracted frequency</span> (warning) &mdash;
                  Don&apos;s player has more games than their weekly contract.
                </li>
                <li>
                  <span className="font-semibold">Substitute assigned</span> (warning) &mdash; A
                  substitute player has been assigned.
                </li>
                <li>
                  <span className="font-semibold">Solo eligibility</span> (error) &mdash; Player in a
                  Solo game has no Solo share level.
                </li>
                <li>
                  <span className="font-semibold">Duplicate in game</span> (error) &mdash; Same
                  player in multiple slots of one game.
                </li>
                <li>
                  <span className="font-semibold">Holiday/blanked assignment</span> (error) &mdash;
                  Player assigned to a non-playable game.
                </li>
                <li>
                  <span className="font-semibold">Consecutive days</span> (error) &mdash; Player
                  flagged as &ldquo;no consecutive days&rdquo; assigned on back-to-back days.
                </li>
                <li>
                  <span className="font-semibold">Do-not-pair</span> (error) &mdash; Two players
                  marked as do-not-pair are in the same game.
                </li>
                <li>
                  <span className="font-semibold">Incomplete game</span> (error) &mdash; Fewer than
                  4 players assigned to a normal-status game.
                </li>
                <li>
                  <span className="font-semibold">Under-assigned</span> (warning) &mdash; Contracted
                  player has fewer games than their frequency requires.
                </li>
                <li>
                  <span className="font-semibold">Derated pairing limit</span> (warning) &mdash;
                  Non-derated player paired with the same derated player more often than the season
                  setting allows.
                </li>
              </ol>
              <p className="text-sm leading-relaxed">
                Results appear as a sorted table: errors first, then by date and game number. A green
                banner means no violations were found.
              </p>
            </div>
          </section>

          {/* ===== REPORTS ===== */}
          <section id="reports" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Reports</h2>
              <p className="text-sm leading-relaxed mb-4">
                All reports are generated as PDF files that open in a new browser tab. You can print
                or save them from there.
              </p>

              <h3 className="font-semibold mb-2">Games By Date</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Compact</span> &mdash; 2 weeks per page. Good
                  for a season overview.
                </li>
                <li>
                  <span className="font-semibold">Worksheet</span> &mdash; 1 week per page with
                  write-in space for on-site changes.
                </li>
                <li>
                  Use the week range selectors to generate a subset of weeks.
                </li>
                <li>
                  Solo games are shown in orange. Holiday games show the holiday name.
                </li>
                <li>
                  9:00 AM games are highlighted in fluorescent yellow.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Player Statistics</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Separate reports for Don&apos;s Group and Solo Group.
                </li>
                <li>
                  Per-player metrics: games played YTD, expected YTD, deficit, balls brought
                  (slot 1 count), YTD cap, and skill level summary.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Pairing Matrix</h3>
              <p className="text-sm leading-relaxed mb-4">
                An N&times;N grid showing how many Don&apos;s group games each pair of players shared.
                Do-not-pair violations are highlighted in red.
              </p>

              <h3 className="font-semibold mb-2">Players List</h3>
              <p className="text-sm leading-relaxed mb-4">
                A printable roster of all active contract players and substitutes with contact info.
              </p>

              <h3 className="font-semibold mb-2">Extra Games</h3>
              <p className="text-sm leading-relaxed">
                Accessible from the Schedule page via &ldquo;Display Extra&rdquo;. Shows all
                instances where a 2+ player received bonus games. Can be exported as a PDF.
              </p>
            </div>
          </section>

          {/* ===== COMMUNICATIONS ===== */}
          <section id="communications" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Communications</h2>
              <p className="text-sm leading-relaxed mb-4">
                The Communications page allows sending bulk emails to players via the Resend email
                service. It has three tabs: Compose, Templates, and History.
              </p>

              <h3 className="font-semibold mb-2">Compose</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Email Settings</span> &mdash; Configure the From
                  Name, Reply-To email, and Test email address. Save with the Save Settings button.
                </li>
                <li>
                  <span className="font-semibold">Recipient Groups</span> &mdash; ALL (everyone with
                  email), Contract Players (active non-subs), Subs (active substitutes), or Test
                  (sends to test email only).
                </li>
                <li>
                  Click &ldquo;Show recipients&rdquo; to see who will receive the email.
                </li>
                <li>
                  Optionally load a saved template to pre-fill subject and body.
                </li>
                <li>
                  Click <span className="font-semibold">Send Email</span> to send. A confirmation
                  dialog shows recipient count before sending.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Templates</h3>
              <p className="text-sm leading-relaxed mb-4">
                Create, edit, and delete reusable email templates with a name, subject, and body.
                Load a template into the Compose tab with one click.
              </p>

              <h3 className="font-semibold mb-2">History</h3>
              <p className="text-sm leading-relaxed">
                View all sent emails with date, subject, group, recipient count, and from name.
                Click any row to expand and see the full message body and recipient list.
              </p>
            </div>
          </section>

          {/* ===== BACKUP & RESTORE ===== */}
          <section id="backup" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Backup &amp; Restore</h2>

              <h3 className="font-semibold mb-2">Download Backup</h3>
              <p className="text-sm leading-relaxed mb-3">
                Click <span className="font-semibold">Download Backup</span> on the Season Setup
                page to download a ZIP file containing CSV exports of all 14 database tables:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>seasons, players, player-blocked-days, player-vacations</li>
                <li>player-do-not-pair, player-solo-pairs, court-schedules, holidays</li>
                <li>games, game-assignments, ball-counts</li>
                <li>email-templates, email-log, email-settings</li>
              </ul>
              <p className="text-sm leading-relaxed mb-4">
                This works in both development and production (online) environments. The backup
                queries the database directly via the application&apos;s database connection.
              </p>

              <h3 className="font-semibold mb-2">Automatic Backup on Reset</h3>
              <p className="text-sm leading-relaxed mb-4">
                When resetting the season, a backup ZIP is automatically downloaded before the
                reset proceeds. If the backup fails, the reset is cancelled.
              </p>

              <h3 className="font-semibold mb-2">Restoring from Backup</h3>
              <p className="text-sm leading-relaxed mb-4">
                To restore player data from a backup CSV, use the{" "}
                <span className="font-semibold">Import CSV</span> button on the Players page. Select
                the full-backup format CSV (15 columns) to restore all player settings including
                skill levels, frequencies, blocked days, vacations, and pairings.
              </p>

              <h3 className="font-semibold mb-2">Database</h3>
              <p className="text-sm leading-relaxed">
                The application uses a Turso cloud database. All data is stored remotely and persists
                across deployments. Regular backups via the Download Backup button are recommended.
              </p>
            </div>
          </section>

          {/* ===== TIPS & TROUBLESHOOTING ===== */}
          <section id="tips" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Tips &amp; Troubleshooting</h2>

              <h3 className="font-semibold mb-2">Best Practices</h3>
              <ul className="list-disc list-inside space-y-2 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Use auto-assign for initial setup</span> &mdash;
                  Auto-assign Solo first, then Don&apos;s, then review and adjust manually per week.
                </li>
                <li>
                  Run the compliance check after making manual adjustments to catch any rule
                  violations.
                </li>
                <li>
                  Balance ball-bringing duty after all assignments are complete for best results.
                </li>
                <li>
                  Use the Player Info panel to quickly see who still needs games without opening
                  individual dropdowns.
                </li>
                <li>
                  Pay attention to <span className="font-semibold text-red-600">MUST</span> flags
                  &mdash; these players have only one remaining playable day and should be prioritized.
                </li>
                <li>
                  Download a backup before making major changes (clearing assignments, regenerating
                  games, resetting the season).
                </li>
                <li>
                  When importing players via CSV for a new season, use the full backup format to
                  preserve all constraints.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Common Issues</h3>
              <ul className="list-disc list-inside space-y-2 text-sm ml-4">
                <li>
                  <span className="font-semibold">&ldquo;Solo games must be fully assigned&rdquo;</span>{" "}
                  &mdash; Don&apos;s auto-assign requires all Solo games to have 4 players. Run Solo
                  auto-assign first.
                </li>
                <li>
                  <span className="font-semibold">Player not in dropdown</span> &mdash; Check: are
                  they on vacation? Blocked day? Already assigned today? Inactive? Do-not-pair
                  conflict? For Solo games: no Solo share level?
                </li>
                <li>
                  <span className="font-semibold">Unpaired half-share warning</span> &mdash; Go to
                  the Players page and set a Solo Pair Partner for the half-share player.
                </li>
                <li>
                  <span className="font-semibold">Auto-assign left unfilled slots</span> &mdash;
                  Not enough eligible players for the number of game slots. Check the auto-assign
                  log for specific warnings. Consider adjusting player constraints or adding subs
                  manually.
                </li>
                <li>
                  <span className="font-semibold">Bonus button disabled</span> &mdash; All 1x/2x
                  contracted players must meet their weekly quota first. Use &ldquo;Bonus All&rdquo;
                  to bypass this restriction.
                </li>
                <li>
                  <span className="font-semibold">Season start date rejected</span> &mdash; Must
                  be a Monday.
                </li>
                <li>
                  <span className="font-semibold">Report shows no data</span> &mdash; Games must be
                  generated and players assigned first.
                </li>
                <li>
                  <span className="font-semibold">Ball balancing &ldquo;No swaps needed&rdquo;</span>{" "}
                  &mdash; Duty is already balanced, or not enough fully-assigned games to optimize.
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
