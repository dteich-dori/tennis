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
  { id: "reports", label: "Reports" },
  { id: "tips", label: "Tips & Troubleshooting" },
  { id: "file-locations", label: "File Locations & Backup" },
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
                player assignments across a 36-week season. It handles court scheduling, player
                management with availability constraints, game generation, weekly player assignments,
                compliance checking, and PDF report generation.
              </p>
              <p className="text-sm leading-relaxed mb-3">
                The application manages two independent player groups:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-3">
                <li>
                  <span className="font-semibold">Don&apos;s Group</span> &mdash; The primary group
                  of contracted players who play on a regular weekly schedule.
                </li>
                <li>
                  <span className="font-semibold">Solo Group</span> &mdash; Players with specific
                  share levels (Full, Half, Quarter, Eighth) who play on designated Solo courts.
                </li>
              </ul>
              <p className="text-sm leading-relaxed">
                Each game has 4 player slots. Player 1 (the first slot) is responsible for bringing
                new balls to the game.
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
                  and set the season start date (must be a Monday).
                </li>
                <li>
                  <span className="font-semibold">Define Court Slots</span> &mdash; Go to{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Court Schedule
                  </span>{" "}
                  and add the weekly recurring court times, assigning each to Don&apos;s or Solo
                  group.
                </li>
                <li>
                  <span className="font-semibold">Add Players</span> &mdash; Go to{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Players
                  </span>{" "}
                  and add all players with their contracted frequency, skill level, and availability
                  constraints. You can also use CSV import.
                </li>
                <li>
                  <span className="font-semibold">Generate Games</span> &mdash; Go to{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Schedule
                  </span>{" "}
                  and click &ldquo;Generate Games&rdquo; to create game slots for all 36 weeks based
                  on the court schedule.
                </li>
                <li>
                  <span className="font-semibold">Assign Players</span> &mdash; Work through each
                  week on the Schedule page, assigning players to game slots using the smart
                  dropdown.
                </li>
                <li>
                  <span className="font-semibold">Check Compliance</span> &mdash; After completing
                  a week&apos;s assignments, run the compliance check to catch any rule violations.
                </li>
                <li>
                  <span className="font-semibold">Balance Balls</span> &mdash; Use the ball
                  balancing feature to distribute ball-bringing duty evenly across players.
                </li>
                <li>
                  <span className="font-semibold">Generate Reports</span> &mdash; Go to{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Reports
                  </span>{" "}
                  to produce PDF schedules, statistics, and player lists for distribution.
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
                  The season spans exactly <span className="font-semibold">36 weeks</span>. The end
                  date is calculated automatically and cannot be changed manually.
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
                  to change the start date of an existing one.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Managing Holidays</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Add holiday dates that fall within the season. Games on these dates will
                  automatically be marked as &ldquo;Holiday&rdquo; status when games are generated.
                </li>
                <li>
                  Holiday games cannot have player assignments &mdash; they appear with an amber
                  background and &ldquo;Holiday&rdquo; label on the Schedule page.
                </li>
                <li>Individual holidays can be removed by clicking the delete button next to each date.</li>
              </ul>

              <h3 className="font-semibold mb-2">Resetting the Season</h3>
              <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm">
                <span className="font-semibold">Warning:</span> Resetting the season permanently
                deletes <span className="font-semibold">everything</span> &mdash; the season,
                all holidays, court schedules, games, and player assignments. You must type{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">DELETE</span>{" "}
                to confirm. This action cannot be undone.
              </div>
            </div>
          </section>

          {/* ===== COURT SCHEDULE ===== */}
          <section id="court-schedule" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Court Schedule</h2>
              <p className="text-sm leading-relaxed mb-3">
                Court slots define the weekly recurring game times. Each slot repeats every week for
                the full 36-week season when games are generated.
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
                  <span className="font-semibold">Start Time</span> &mdash; The game start time
                  (e.g., 9:00, 10:30).
                </li>
                <li>
                  <span className="font-semibold">Solo Group</span> &mdash; Check this box if the
                  court is designated for Solo group players. Unchecked means Don&apos;s group.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mb-3">
                The system prevents duplicate court slots (same day, time, and court number). Court
                slots can be edited or deleted at any time. The table displays all slots sorted by
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

              <h3 className="font-semibold mb-2">Adding a Player</h3>
              <p className="text-sm leading-relaxed mb-2">
                Each player has the following attributes:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">First Name / Last Name</span> &mdash; Required.
                  Used for identification throughout the application.
                </li>
                <li>
                  <span className="font-semibold">Contact Info</span> &mdash; Cell phone, home
                  phone, and email address (all optional). Appears in the Players List report.
                </li>
                <li>
                  <span className="font-semibold">Contracted Frequency</span> &mdash; How many
                  games per week the player is contracted for:
                  <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                    <li>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                        Sub
                      </span>{" "}
                      &mdash; Substitute player, 0 games per week (fills in as needed)
                    </li>
                    <li>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                        1x/week
                      </span>{" "}
                      &mdash; One game per week
                    </li>
                    <li>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                        2x/week
                      </span>{" "}
                      &mdash; Two games per week
                    </li>
                    <li>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                        2+/week
                      </span>{" "}
                      &mdash; Two or more games per week (eligible for bonus games)
                    </li>
                  </ul>
                </li>
                <li>
                  <span className="font-semibold">Skill Level</span> &mdash; A (highest), B, C, or
                  D. Used for sorting in bonus mode and statistics.
                </li>
                <li>
                  <span className="font-semibold">Solo Share Level</span> &mdash; Determines Solo
                  group eligibility: None (not in Solo), Full, Half, Quarter, or Eighth. Players
                  with a Solo share can be assigned to Solo group games.
                </li>
                <li>
                  <span className="font-semibold">Active</span> &mdash; Inactive players are
                  excluded from the assignment dropdown and do not appear in weekly scheduling.
                </li>
                <li>
                  <span className="font-semibold">No Consecutive Days</span> &mdash; When checked,
                  this player cannot be assigned to games on back-to-back days. Violations are
                  caught by the compliance checker.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Blocked Days</h3>
              <p className="text-sm leading-relaxed mb-2">
                Check any day of the week when the player is unavailable. For example, if a player
                cannot play on Mondays and Wednesdays, check those days. The assignment dropdown
                will automatically exclude the player from games on blocked days.
              </p>

              <h3 className="font-semibold mb-2 mt-4">Vacations</h3>
              <p className="text-sm leading-relaxed mb-2">
                Add one or more vacation ranges for each player. Each range has a{" "}
                <span className="font-semibold">start date</span> (first day away) and a{" "}
                <span className="font-semibold">return date</span> (first day back). Players on
                vacation are excluded from the assignment dropdown for games during those dates.
              </p>

              <h3 className="font-semibold mb-2 mt-4">CSV Import</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Import a roster from a CSV file. Expected column order: Last Name, First Name,
                  Cell, Home, Email.
                </li>
                <li>
                  The first row (header) is automatically skipped. Rows with names like
                  &ldquo;HOLIDAY&rdquo;, &ldquo;GAME&rdquo;, &ldquo;TBD&rdquo;, or
                  &ldquo;OPEN&rdquo; are ignored.
                </li>
                <li>
                  All imported players default to: Active, 1x/week frequency, Skill C, Solo None.
                  Adjust settings after import as needed.
                </li>
                <li>A confirmation dialog shows the count of players to be imported before proceeding.</li>
              </ul>
              <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm mb-4">
                <span className="font-semibold">Note:</span> CSV import does not check for
                duplicates. Review your data before importing to avoid duplicate player entries.
              </div>

              <h3 className="font-semibold mb-2">Player Table</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                <li>
                  Click column headers to sort by Last Name, First Name, Skill Level, or Frequency.
                  Click again to reverse the sort order.
                </li>
                <li>
                  Use the{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Show Inactive
                  </span>{" "}
                  toggle to include or exclude inactive players from the table.
                </li>
                <li>
                  The footer shows counts: active players, inactive players (when shown), and total.
                </li>
              </ul>
            </div>
          </section>

          {/* ===== SCHEDULE ===== */}
          <section id="schedule" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Schedule</h2>
              <p className="text-sm leading-relaxed mb-4">
                The Schedule page is the main workspace for assigning players to games. It displays
                one week at a time with all games grouped by date.
              </p>

              <h3 className="font-semibold mb-2">Generating Games</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Click{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Generate Games
                  </span>{" "}
                  to create game slots for all 36 weeks based on your court schedule.
                </li>
                <li>
                  Each court slot produces one game per week. For example, 3 court slots create 3
                  games per week, or 108 games for the full season.
                </li>
                <li>
                  Games on holiday dates are automatically marked with &ldquo;Holiday&rdquo; status.
                </li>
                <li>
                  If games already exist, the button becomes{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Regenerate Games
                  </span>{" "}
                  &mdash; this deletes all existing games and assignments first.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Week Navigation</h3>
              <p className="text-sm leading-relaxed mb-4">
                Use the{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Prev</span>{" "}
                and{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Next</span>{" "}
                buttons or the week dropdown to navigate between weeks 1&ndash;36. The header shows
                the number of games in the current week and total games for the season.
              </p>

              <h3 className="font-semibold mb-2">Assigning Players</h3>
              <p className="text-sm leading-relaxed mb-2">
                Click the{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  + assign
                </span>{" "}
                button on any empty player slot to open the assignment dropdown. The dropdown shows
                available players intelligently sorted:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-3">
                <li>
                  <span className="font-semibold text-red-600">MUST</span> &mdash; Players who have
                  only one remaining playable day this week and still owe games. These players
                  should be assigned first.
                </li>
                <li>
                  Players are sorted by games owed (highest first), then by last name.
                </li>
                <li>
                  The <span className="font-semibold">Owed</span> column shows how many more games
                  the player needs this week (color-coded: positive = needs games, zero = fulfilled).
                </li>
                <li>
                  The <span className="font-semibold">YTD</span> column shows total games played
                  year-to-date. Players with a YTD deficit are flagged.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mb-4">
                Players are automatically filtered out if they: are already assigned that day (one
                game per day rule), are on vacation, have a blocked day, are already in this game,
                or are inactive.
              </p>

              <h3 className="font-semibold mb-2">Player 1 = Ball Bringer</h3>
              <p className="text-sm leading-relaxed mb-4">
                The first player slot in each game is the ball bringer &mdash; this player is
                responsible for bringing new balls. The slot is marked with an asterisk (*) in
                reports. Use the Ball Balancing feature to distribute this duty evenly.
              </p>

              <h3 className="font-semibold mb-2">Edit Mode</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Check the <span className="font-semibold">Edit</span> checkbox on any game row to
                  enable editing for that game.
                </li>
                <li>
                  When edit mode is active, an &ldquo;x&rdquo; button appears next to each assigned
                  player to remove them individually.
                </li>
                <li>
                  A{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Clear
                  </span>{" "}
                  link appears to remove all assignments from the game at once.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Player Info Panel</h3>
              <p className="text-sm leading-relaxed mb-4">
                Click the{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  Player Info
                </span>{" "}
                button to toggle a compact status panel showing all Don&apos;s group players. Each
                entry shows: player name, games owed this week (green = owes, gray = fulfilled, red
                = over-assigned), blocked days, and a &ldquo;V&rdquo; indicator if on vacation this
                week.
              </p>

              <h3 className="font-semibold mb-2">Bonus Mode</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Bonus</span> button &mdash; Activates after all
                  contracted players (1x and 2x frequency) have been assigned their weekly quota.
                  Shows 2+ frequency players in the dropdown with a green &ldquo;BONUS&rdquo; label,
                  sorted by skill level (A first).
                </li>
                <li>
                  <span className="font-semibold">Bonus All</span> button &mdash; Shows all
                  available players as bonus options regardless of contracted status. Useful for
                  filling remaining empty slots.
                </li>
                <li>
                  The two modes are mutually exclusive &mdash; activating one deactivates the other.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Ball Balancing</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Click{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Balls Don&apos;s
                  </span>{" "}
                  or{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Balls Solo
                  </span>{" "}
                  to optimize ball-bringing assignments for the respective group.
                </li>
                <li>
                  A preview dialog shows the proposed swaps: which game, who currently brings
                  balls, and who would be the new ball bringer.
                </li>
                <li>
                  The imbalance score indicates how uneven the current distribution is (lower is
                  better).
                </li>
                <li>
                  Click{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Apply Swaps
                  </span>{" "}
                  to save the changes, or{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    Cancel
                  </span>{" "}
                  to discard.
                </li>
              </ul>
              <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 text-sm mb-4">
                <span className="font-semibold">Tip:</span> Run ball balancing after all player
                assignments are complete for the desired week range, so the algorithm has the most
                data to work with.
              </div>

              <h3 className="font-semibold mb-2">Compliance Checking</h3>
              <p className="text-sm leading-relaxed mb-2">
                Click{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  Don&apos;s Compliance
                </span>{" "}
                or{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  Solo Compliance
                </span>{" "}
                to validate all assignments for the current week. The checker verifies these rules:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm ml-4 mb-3">
                <li>
                  <span className="font-semibold">One game per day</span> &mdash; A player cannot
                  be assigned to multiple games on the same date.
                </li>
                <li>
                  <span className="font-semibold">Vacation conflict</span> &mdash; Player is
                  assigned during their vacation dates.
                </li>
                <li>
                  <span className="font-semibold">Blocked day</span> &mdash; Player is assigned on
                  a day of the week they have blocked.
                </li>
                <li>
                  <span className="font-semibold">Inactive player</span> &mdash; An inactive player
                  is assigned to a game.
                </li>
                <li>
                  <span className="font-semibold">Over contracted frequency</span> &mdash; Player
                  has more games than their weekly contract allows.
                </li>
                <li>
                  <span className="font-semibold">Substitute assigned</span> &mdash; A substitute
                  player (frequency = Sub) has been assigned.
                </li>
                <li>
                  <span className="font-semibold">Solo eligibility</span> &mdash; Player in a Solo
                  game does not have a Solo share level set.
                </li>
                <li>
                  <span className="font-semibold">Duplicate in game</span> &mdash; Same player
                  assigned to multiple slots in one game.
                </li>
                <li>
                  <span className="font-semibold">Holiday/blanked assignment</span> &mdash; Players
                  assigned to a game with holiday or blanked status.
                </li>
                <li>
                  <span className="font-semibold">Consecutive days</span> &mdash; Player flagged as
                  &ldquo;no consecutive days&rdquo; is assigned on back-to-back days.
                </li>
                <li>
                  <span className="font-semibold">Do-not-pair</span> &mdash; Two players marked as
                  &ldquo;do not pair&rdquo; are in the same game.
                </li>
                <li>
                  <span className="font-semibold">Under-assigned</span> &mdash; Contracted players
                  have fewer games than their weekly frequency requires.
                </li>
              </ol>
              <p className="text-sm leading-relaxed mb-4">
                Results appear as a table showing severity (error/warning), rule name, player name,
                date, and details. A green banner means no violations were found.
              </p>

              <h3 className="font-semibold mb-2">Game Statuses</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                <li>
                  <span className="font-semibold">Normal</span> &mdash; Regular game, players can
                  be assigned. White or alternating tan background.
                </li>
                <li>
                  <span className="font-semibold">Holiday</span> &mdash; Falls on a holiday date.
                  Amber background, no assignments allowed.
                </li>
                <li>
                  <span className="font-semibold">Blanked</span> &mdash; Removed from play (e.g.,
                  makeup week). Gray background, no assignments allowed.
                </li>
              </ul>
            </div>
          </section>

          {/* ===== REPORTS ===== */}
          <section id="reports" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Reports</h2>
              <p className="text-sm leading-relaxed mb-4">
                All reports are generated as PDF files that open in a new browser tab. You can print
                or save them from there. Reports are listed alphabetically on the Reports page.
              </p>

              <h3 className="font-semibold mb-2">Games By Date</h3>
              <p className="text-sm leading-relaxed mb-2">
                A schedule showing all games with their player assignments, organized by date. Two
                variants are available:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-3">
                <li>
                  <span className="font-semibold">Compact</span> &mdash; Fits 2 weeks per page.
                  Good for a season overview or quick reference.
                </li>
                <li>
                  <span className="font-semibold">Worksheet</span> &mdash; Fits 1 week per page
                  with extra write-in space below each game row. The write-in area has a dashed
                  separator so Don can cross out players who can&apos;t make it and handwrite
                  replacement names.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mb-3">
                Use the week range selectors to generate a subset of weeks (e.g., weeks 1&ndash;4).
                Games starting at 9:00 AM are highlighted in{" "}
                <span className="bg-yellow-200 px-1.5 py-0.5 rounded text-xs font-semibold">
                  fluorescent yellow
                </span>{" "}
                so they stand out from the more common 10:30 time slot.
              </p>
              <p className="text-sm leading-relaxed mb-4">
                The report footer includes the preparation date/time, &ldquo;Player 1 brings new
                balls&rdquo; reminder, and page numbers.
              </p>

              <h3 className="font-semibold mb-2">Player Statistics</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Separate reports for <span className="font-semibold">Don&apos;s Group</span> and{" "}
                  <span className="font-semibold">Solo Group</span>.
                </li>
                <li>
                  Shows per-player metrics: games played YTD, expected YTD (based on contract),
                  deficit (games owed), balls brought (slot 1 count), and weeks played.
                </li>
                <li>Sorted by last name.</li>
              </ul>

              <h3 className="font-semibold mb-2">Players List</h3>
              <p className="text-sm leading-relaxed">
                A printable list of all active contract players and substitutes with their contact
                information (name, phone numbers, email). Useful for distribution to group members.
              </p>
            </div>
          </section>

          {/* ===== TIPS & TROUBLESHOOTING ===== */}
          <section id="tips" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Tips & Troubleshooting</h2>

              <h3 className="font-semibold mb-2">Best Practices</h3>
              <ul className="list-disc list-inside space-y-2 text-sm ml-4 mb-4">
                <li>
                  Work through weeks sequentially for best results &mdash; the system tracks
                  year-to-date counts that help balance player assignments.
                </li>
                <li>
                  Run the compliance check after completing each week&apos;s assignments to catch
                  issues early.
                </li>
                <li>
                  Use the Player Info panel to quickly see who still needs games this week without
                  opening individual dropdowns.
                </li>
                <li>
                  Balance ball-bringing duty after all player assignments are complete for a range of
                  weeks, so the algorithm has the most data to work with.
                </li>
                <li>
                  When importing players via CSV, review the file first &mdash; the import does not
                  detect duplicate entries.
                </li>
                <li>
                  Pay attention to the <span className="font-semibold text-red-600">MUST</span>{" "}
                  flag in the assignment dropdown &mdash; these players have only one remaining
                  playable day and should be prioritized.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Common Issues</h3>
              <ul className="list-disc list-inside space-y-2 text-sm ml-4">
                <li>
                  <span className="font-semibold">&ldquo;No games generated yet&rdquo;</span>{" "}
                  &mdash; Make sure you have defined court slots on the Court Schedule page, then
                  click Generate Games on the Schedule page.
                </li>
                <li>
                  <span className="font-semibold">Player not appearing in dropdown</span> &mdash;
                  Check if the player is on vacation, has a blocked day for that date, is already
                  assigned to another game on the same day, is inactive, or (for Solo games) does
                  not have a Solo share level set.
                </li>
                <li>
                  <span className="font-semibold">Season start date rejected</span> &mdash; The
                  start date must be a Monday. Select a different date that falls on a Monday.
                </li>
                <li>
                  <span className="font-semibold">Bonus button is disabled</span> &mdash; The
                  &ldquo;Bonus&rdquo; button only activates once all contracted players (1x and 2x
                  frequency) have been assigned their full weekly quota. Use &ldquo;Bonus
                  All&rdquo; instead if you need to assign bonus players before then.
                </li>
                <li>
                  <span className="font-semibold">Ball balancing shows &ldquo;No swaps needed&rdquo;</span>{" "}
                  &mdash; Ball-bringing duty is already evenly distributed, or there are not enough
                  fully-assigned games (all 4 slots filled) to optimize.
                </li>
                <li>
                  <span className="font-semibold">Report shows no data</span> &mdash; Make sure
                  games have been generated and players have been assigned. Reports pull data from
                  existing assignments.
                </li>
              </ul>
            </div>
          </section>

          {/* ===== FILE LOCATIONS & BACKUP ===== */}
          <section id="file-locations" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">File Locations & Backup</h2>

              <h3 className="font-semibold mb-2">Application Files</h3>
              <ul className="list-disc list-inside space-y-2 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Application root:</span>{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    /Users/doriteich/TennisScheduler/app
                  </span>
                </li>
                <li>
                  <span className="font-semibold">Source code:</span>{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    /Users/doriteich/TennisScheduler/app/src
                  </span>
                </li>
                <li>
                  <span className="font-semibold">Database (SQLite):</span>{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    /Users/doriteich/TennisScheduler/app/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/
                  </span>
                  <br />
                  <span className="text-muted ml-6">
                    The database is the{" "}
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.sqlite</span>{" "}
                    file inside this folder. It contains all season data, players, games, and assignments.
                  </span>
                </li>
                <li>
                  <span className="font-semibold">Git repository:</span>{" "}
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                    /Users/doriteich/TennisScheduler
                  </span>
                  <br />
                  <span className="text-muted ml-6">
                    All code changes are version-controlled with Git. The database is not tracked by Git.
                  </span>
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Backing Up the Database</h3>
              <p className="text-sm leading-relaxed mb-2">
                The database file stores all your season data, players, games, and assignments.
                To create a backup, copy the{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.sqlite</span>{" "}
                file from the database folder to a safe location:
              </p>
              <div className="bg-gray-50 border border-border rounded px-4 py-3 text-xs font-mono mb-3 overflow-x-auto">
                cp /Users/doriteich/TennisScheduler/app/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite ~/Desktop/tennis-backup-$(date +%Y%m%d).sqlite
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm mb-4">
                <span className="font-semibold">Important:</span> Stop the application before
                copying the database file to ensure a clean backup. The database uses WAL
                (Write-Ahead Logging) mode, so also copy any{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.sqlite-wal</span>{" "}
                and{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.sqlite-shm</span>{" "}
                files if they exist.
              </div>

              <h3 className="font-semibold mb-2">Restoring from Backup</h3>
              <p className="text-sm leading-relaxed mb-2">
                To restore from a backup, stop the application, replace the{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.sqlite</span>{" "}
                file in the database folder with your backup file, then restart the application.
              </p>

              <h3 className="font-semibold mb-2">Starting the Application</h3>
              <p className="text-sm leading-relaxed mb-2">
                To start the application, open a terminal and run:
              </p>
              <div className="bg-gray-50 border border-border rounded px-4 py-3 text-xs font-mono mb-3">
                cd /Users/doriteich/TennisScheduler/app && npm run dev
              </div>
              <p className="text-sm leading-relaxed mb-4">
                The application will be available at{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  http://localhost:3000
                </span>{" "}
                in your web browser.
              </p>

              <h3 className="font-semibold mb-2">Restarting After a Crash</h3>
              <p className="text-sm leading-relaxed mb-2">
                If the application becomes unresponsive or crashes, allow Claude to run the
                following command to kill the existing process and remove the lock file:
              </p>
              <div className="bg-gray-50 border border-border rounded px-4 py-3 text-xs font-mono mb-3 overflow-x-auto">
                {`cd /Users/doriteich/TennisScheduler/app && pkill -f "next dev" 2>/dev/null; rm -f .next/dev/lock`}
              </div>
              <p className="text-sm leading-relaxed mb-2">
                Then restart the application with:
              </p>
              <div className="bg-gray-50 border border-border rounded px-4 py-3 text-xs font-mono mb-3">
                npm run dev
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 text-sm">
                <span className="font-semibold">Tip:</span> You can simply tell Claude
                &ldquo;crashed&rdquo; or &ldquo;app stopped&rdquo; and it will automatically
                run these commands to restart the application for you.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
