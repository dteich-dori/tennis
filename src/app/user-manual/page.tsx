"use client";

// User Manual for Tennis Scheduler
// Keep in sync with feature changes across the application.

import { generateFlowchartPdf } from "@/lib/reports/flowchartPdf";

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
                  to redistribute ball-bringing duty across the entire season.
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

              <h3 className="font-semibold mb-2">C Games Minimum</h3>
              <p className="text-sm leading-relaxed mb-2">
                As of v1.212 the C-games rules were collapsed to a single season-wide floor plus
                an optional per-player ceiling &mdash; the old per-week/per-month frequency
                dropdowns (2x players / 1x players) and the season-wide A+C games cap were retired.
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-2">
                <li>
                  <span className="font-semibold">C games minimum</span> (season setting,
                  default 1) &mdash; every A/B player takes at least this many A+C-adjacent games
                  per season, regardless of whether their <em>C games OK</em> checkbox is on.
                  Applies to everyone; it is a floor, not a per-player opt-in.
                </li>
                <li>
                  <span className="font-semibold">Max C-games / season</span> (per-player field on
                  the Players page) &mdash; overrides the season floor for an individual player.
                  Leave blank to use the season minimum. Set to <code>0</code> to shield a specific
                  player from C-adjacent games entirely.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mb-4">
                A hard cap of <span className="font-semibold">1 C-adjacent game per player per
                week</span> still applies regardless of these settings, so a willing player can&apos;t
                absorb every open C-slot in a single week.
              </p>

              <h3 className="font-semibold mb-2">Allowed Skill-Level Compositions</h3>
              <p className="text-sm leading-relaxed mb-4">
                A checkbox grid on Season Setup lets you choose which skill-level combinations
                (AAAA, AABB, AACC, ABBC, etc.) auto-assign is allowed to create. Changes take
                effect on the next auto-assign run. If you deselect combinations that make a
                season infeasible to fill, the app warns you before saving.
              </p>

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
                  <span className="font-semibold">Regeneration resets the season to 36 base weeks.</span>{" "}
                  If makeup weeks (37, 38) were previously added, totalWeeks and endDate are reset
                  back to the 36-week baseline. You must re-add makeup weeks manually via the{" "}
                  <span className="font-semibold">Add Makeup Week</span> button after regenerating.
                  This prevents auto-assigning players to extra weeks that require manual scheduling.
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
                  skipped. Three checkboxes control optional passes:
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                    <li><span className="font-semibold">STD catchup</span> (on by default) &mdash; After the initial assignment completes, runs a second pass over all weeks to fill remaining empty slots with players who have a season-total deficit (behind on their 36-week contract).</li>
                    <li><span className="font-semibold">Assign extra</span> &mdash; Allows 2+ contract players to play beyond their weekly minimum of 2 games.</li>
                    <li><span className="font-semibold">Assign subs</span> &mdash; Off by default. When on, substitute players whose &ldquo;Include in auto-assign&rdquo; flag is set may fill any remaining empty slots.</li>
                  </ul>
                  A <span className="font-semibold">Stop</span> button appears during the run to cancel the assignment mid-season.
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

              <h3 className="font-semibold mb-2">Editing Court Slots (Cascade Updates)</h3>
              <p className="text-sm leading-relaxed mb-3">
                When you edit a court slot (change group, time, court number, or day), the change
                automatically <span className="font-semibold">cascades to all existing games</span>{" "}
                that match the old slot values. Player assignments are preserved &mdash; you do not
                need to clear assignments before editing.
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-3">
                <li>
                  <span className="font-semibold">Change Solo &harr; Don&apos;s</span> &mdash; All
                  matching games update their group field. Players remain assigned.
                </li>
                <li>
                  <span className="font-semibold">Change time or court number</span> &mdash; All
                  matching games update accordingly. Assignments stay intact.
                </li>
                <li>
                  <span className="font-semibold">Delete a slot</span> &mdash; Removes only the
                  court schedule entry. Existing games from that slot remain as orphans (they will
                  not be regenerated if games are regenerated later).
                </li>
              </ul>
              <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 text-sm">
                <span className="font-semibold">Tip:</span> Define all court slots before generating
                games. If you need to <span className="font-semibold">add new</span> slots after
                game generation, you will need to regenerate games (which removes all existing
                assignments). However, <span className="font-semibold">editing</span> existing slots
                cascades automatically without affecting assignments.
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
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">1+/week (also subs)</span>{" "}
                      &mdash; One guaranteed game per week AND eligible to be picked from the sub pool. 1+ players have priority over pure subs when auto-assign needs to fill open slots. Their fee is 1x base + sub-rate per extra game beyond their weekly contract.
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
                  <span className="font-semibold">Include in auto-assign</span> &mdash; On by
                  default. When unchecked, auto-assign skips this player entirely while they
                  remain visible everywhere else (manual assignment, communications, reports,
                  Accounts). Useful for subs you want to keep on the roster but not auto-schedule
                  &mdash; for subs (frequency 0), this flag must also be on AND the Schedule page&apos;s
                  &ldquo;Assign subs&rdquo; option must be enabled at run time for them to be
                  picked. Excluded players show a small amber <span className="bg-amber-100 text-amber-800 border border-amber-300 px-1 rounded text-[10px]">⛔ AA</span>{" "}
                  badge on the roster row.
                </li>
                <li>
                  <span className="font-semibold">No Consecutive Days</span> &mdash; Prevents
                  scheduling on back-to-back calendar days.
                </li>
                <li>
                  <span className="font-semibold">C Games OK</span> &mdash; Indicates the player is
                  explicitly willing to play in games with C-level players. Since v1.212 this flag
                  no longer gates whether a player can be placed in a C-adjacent game &mdash; every
                  A/B player is eligible up to the season&apos;s C games minimum (see Season Setup)
                  or their own <em>Max C-games / season</em> ceiling if set. Note: 1x A players are
                  never placed with C players regardless of this flag (composition rule).
                </li>
                <li>
                  <span className="font-semibold">Max C-games / season</span> &mdash; Per-player
                  override of the season&apos;s C games minimum (blank = use the season default).
                  Set to 0 to shield a player from C-adjacent games entirely. See Season Setup for
                  details.
                </li>
                <li>
                  <span className="font-semibold">No Early Games</span> &mdash; Prevents scheduling before 10:00 AM.
                </li>
                <li>
                  <span className="font-semibold">No Vacation Makeup</span> &mdash; When checked,
                  auto-assign&apos;s Pass 2.5 front-loading (boosting this player&apos;s weekly
                  target ahead of an upcoming vacation to make up missed games) is skipped. The
                  player simply loses the games they miss on vacation instead of playing extra
                  games beforehand to compensate.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Player Groups</h3>
              <p className="text-sm leading-relaxed mb-2">
                A player can be designated as a <span className="font-semibold">Group Leader</span> with a preferred group of up to 15 members.
                The group percentage (25%, 50%, or 100%) determines what fraction of the leader&apos;s games should include members from their group.
              </p>
              <p className="text-sm leading-relaxed mb-4">
                Setting the group to <span className="font-semibold">Inactive (0%)</span> disables group-preferential assignment but
                <em> preserves the member list</em>. This allows you to temporarily deactivate a group without losing the member configuration.
                Members are shown dimmed with an &ldquo;inactive &mdash; members preserved&rdquo; label. You can still add or remove members while inactive.
              </p>

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
                  only one remaining playable day this week and are still owed games. Assign these first.
                </li>
                <li>
                  The dropdown header shows four sortable columns: <span className="font-semibold">Lvl</span> (skill level),{" "}
                  <span className="font-semibold">Owed</span> (games remaining this week),{" "}
                  <span className="font-semibold">YTD</span> (behind pace through current week), and{" "}
                  <span className="font-semibold">STD</span> (games remaining for the full 36-week season contract).
                  Click any header to sort by that column. STD is shown in blue when the player has a season deficit.
                </li>
                <li>
                  Players with WTD owed, YTD deficit, or STD deficit appear in the regular section even when their weekly quota is met.
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

              <h3 className="font-semibold mb-2">Stale-Schedule Warning</h3>
              <p className="text-sm leading-relaxed mb-4">
                The Schedule page shows an amber banner at the top when any player record was
                added, edited, or deleted <em>after</em> the last auto-assign run. This signals
                that the current schedule may no longer reflect the active roster (e.g. a new
                sub was added, a vacation was extended, a player&apos;s contract changed).
                Re-running auto-assign clears the warning. The banner shows the exact timestamps
                of both events.
              </p>

              <h3 className="font-semibold mb-2">Player Info Panel</h3>
              <p className="text-sm leading-relaxed mb-4">
                Click <span className="font-semibold">Player Info</span> to toggle a compact card
                grid showing all Don&apos;s group players with their: contracted frequency, WTD owed
                (green = owed games), YTD owed, blocked days, and a red &ldquo;V&rdquo; if on
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg">Auto-Assign: Don&apos;s Group Algorithm</h2>
                <button
                  onClick={() => generateFlowchartPdf()}
                  className="bg-primary text-white px-3 py-1.5 rounded text-xs hover:bg-primary-hover transition-colors"
                >
                  View Flowchart PDF
                </button>
              </div>
              <p className="text-sm leading-relaxed mb-4">
                The Don&apos;s auto-assign algorithm fills all Don&apos;s game slots for a given week.
                It can be run per-week from the Schedule page, or for all weeks at once from the
                Season Setup page. When run for all weeks, each week is processed sequentially so
                YTD counts accumulate naturally.
              </p>

              <h3 className="font-semibold mb-2">Assignment Rules (numbered)</h3>
              <p className="text-sm leading-relaxed mb-2">
                Every candidate player is checked against this rule list. Block reasons in the
                empty-slot panel reference these rule numbers (e.g. <code>[R7]</code>).
              </p>
              <table className="w-full text-sm mb-4 border border-border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-2 py-1 font-medium">Rule</th>
                    <th className="text-left px-2 py-1 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R1</td>
                    <td className="px-2 py-1">Player must be active (<code>isActive=true</code>).</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R2</td>
                    <td className="px-2 py-1">
                      Player must have <em>Include in auto-assign</em> checked on their player record.
                      This check happens at player-load time — players with it unchecked are filtered out of
                      both the contracted-pool and the sub-pool before any rule below is evaluated,
                      so they never appear in the eligibility lists or the diagnostic panel.
                      Use this to keep a player on the roster (visible in dropdowns, communications,
                      reports, Accounts) but invisible to the scheduler.
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R3</td>
                    <td className="px-2 py-1">Player must not have this day-of-week in their blocked-days list.</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R4</td>
                    <td className="px-2 py-1">Player must not have a vacation overlapping the game date.</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R5</td>
                    <td className="px-2 py-1">Player must not already be playing another game on the same date (one game per date).</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R6</td>
                    <td className="px-2 py-1">Player must not have a do-not-pair conflict with anyone already in this game (either direction).</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R7</td>
                    <td className="px-2 py-1">Player&apos;s weekly assignments must not exceed their contract: 1x→1, 1x+→1, 2x→2, 2x+→2 (extras allowed only via gated Passes 2.5/3/3.5).</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R8</td>
                    <td className="px-2 py-1">Composition: A+C combos are blocked except <strong>AACC</strong> (2 A&apos;s + 2 C&apos;s + 0 B&apos;s). A B is blocked from a game that already has both A and C.</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R9</td>
                    <td className="px-2 py-1">If <em>No early games</em> is checked, player can&apos;t be put in a game starting before 10:00 AM.</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R10</td>
                    <td className="px-2 py-1">If <em>No consecutive days</em> is checked, player can&apos;t be put in a game on the day before or day after another game they&apos;re already in.</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono text-muted">R11</td>
                    <td className="px-2 py-1 text-muted">
                      <em>(retired in v1.151)</em> Derated pairing limit. The
                      derated concept has been replaced by simpler tools:
                      promote/demote a player&apos;s skill level (A → B → C) if
                      they fall behind in capability, and use C-anchor groups
                      plus unchecking <em>Include in auto-assign</em> to isolate
                      specific players.
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R12</td>
                    <td className="px-2 py-1">
                      Season cap: only the <strong>base-tier</strong> contracts (1x, 2x) are capped at{" "}
                      <code>freq × 36</code> total games for the season. The &ldquo;+&rdquo; tiers
                      (1x+, 2x+) are <em>uncapped by design</em> — the +&apos;s whole point is to
                      allow sub-style or extras-style play above the base contract, so the algorithm
                      doesn&apos;t apply this hard cap to them. Subs (0) are also uncapped (they
                      have no contract to compare against).
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R13</td>
                    <td className="px-2 py-1">
                      <strong>Extras gate</strong> — Passes 2.5 (vacation makeup), 3 (2+ extras), and 3.5 (STD catch-up) will not fire while any contracted player with an unmet weekly contract <em>could play this specific game&apos;s day</em>. Refined in v1.153 from a global &ldquo;any day this week&rdquo; check — a gating player who is blocked on the current day, on vacation, or already playing that date doesn&apos;t block the extras passes for that day. This avoids leaving slots empty when the &ldquo;blocker&rdquo; couldn&apos;t fill them anyway.
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-2 py-1 font-mono">R14</td>
                    <td className="px-2 py-1">
                      <strong>cGamesOk (C-games OK)</strong> — checkbox on the player record.
                      It gates <em>group membership</em>: an A or B player may join a C anchor&apos;s
                      group only if their cGamesOk checkbox is on (C players can always join). If a
                      member unchecks cGamesOk, their group anchor is auto-cleared on save and a
                      new auto-assign run is needed. As of v1.212 it no longer gates Pass 2.8
                      eligibility — every A/B player is eligible for C-adjacent games up to the
                      season&apos;s C games minimum or their own per-player <em>Max C-games /
                      season</em> ceiling (see Season Setup and Players sections).
                    </td>
                  </tr>
                </tbody>
              </table>

              <h3 className="font-semibold mb-2">WTD / YTD / STD metrics</h3>
              <p className="text-sm leading-relaxed mb-2">
                Three running counts track how much each player has played:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-3">
                <li>
                  <strong>WTD</strong> (Week-to-Date) — games already assigned for the
                  current week only. Used for eligibility (R7) and must-play (player has
                  only 1 remaining playable day this week and still has games owed).
                </li>
                <li>
                  <strong>YTD</strong> (Year-to-Date) — cumulative games from week 1
                  through the current week. <code>ytdDeficit = freq × currentWeek − ytd</code>{" "}
                  — positive means the player is behind pace.
                </li>
                <li>
                  <strong>STD</strong> (Season Total) — cumulative games across the entire
                  season (all 36+ weeks). <code>stdDeficit = freq × 36 − std</code> — positive
                  means the player is behind on their full-season target. STD is also the
                  gate for Pass 3.5 (STD catch-up).
                </li>
              </ul>
              <p className="text-sm leading-relaxed mb-2">
                <strong>Priority sort</strong> when choosing who fills a slot (highest to lowest):
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm ml-4 mb-4">
                <li><strong>mustPlay</strong> (WTD-derived — only 1 playable day left and still owed)</li>
                <li>Sub tier — 1+ outranks pure subs in the sub-fill pass</li>
                <li>Composition penalty — avoid A+C violations</li>
                <li>Pairing diversity — fewer repeat pairings is better</li>
                <li><strong>owed</strong> (WTD-derived — <code>freq − wtd</code>)</li>
                <li>playableDaysLeft — fewer remaining days = more constrained = higher</li>
                <li><strong>ytdDeficit</strong> — more behind on year-to-date pace = higher</li>
                <li><strong>stdDeficit</strong> — more behind on season target = higher</li>
                <li>Random tiebreak</li>
              </ol>
              <p className="text-sm leading-relaxed mb-4">
                In short: <strong>WTD comes first</strong> (must-play + owed), then constrained-day
                tightness, then <strong>YTD</strong>, then <strong>STD</strong>. WTD answers
                &ldquo;does this player need a game this week?&rdquo;, YTD answers &ldquo;is this
                player keeping up so far?&rdquo;, and STD answers &ldquo;will this player finish
                their contract by the end of the season?&rdquo;
              </p>

              <h3 className="font-semibold mb-2">Empty-slot panel</h3>
              <p className="text-sm leading-relaxed mb-4">
                Click any empty slot on the Schedule page to open the diagnostic panel. It shows:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li><strong>Lineup</strong> with current players + the empty placeholders.</li>
                <li><strong>Gating Players</strong> section (orange) when R13 is active — lists who has unmet weekly contract and how many playable days they have left.</li>
                <li><strong>Players Who Are Owed Games</strong> — eligible candidates only; blocked candidates are summarised as &ldquo;+ N hidden&rdquo; in the header.</li>
                <li>Each blocked candidate&apos;s reason text includes the rule number, e.g. <code>[R8] A+C block: …</code> or <code>[R7] Weekly contract met …</code>.</li>
              </ul>

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

              <h3 className="font-semibold mb-2">Step 2: Player Availability &amp; Filtering</h3>
              <p className="text-sm leading-relaxed mb-2">
                The algorithm pre-computes two things before filtering, then applies a per-slot
                eligibility filter using the numbered Assignment Rules above.
              </p>
              <p className="text-sm leading-relaxed mb-1"><strong>Pre-computed inputs:</strong></p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-3">
                <li>
                  <span className="font-semibold">Solo exclusion</span> &mdash; Players already
                  assigned to a Solo game on a given date are excluded from Don&apos;s games on
                  that same date (one game per day rule, R5).
                </li>
                <li>
                  <span className="font-semibold">Per-day surplus check</span> &mdash; For each
                  day with games, the algorithm counts eligible players vs. slots needed and
                  logs a warning when a day is tight.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mb-1"><strong>Per-slot filter</strong> (applied for every empty slot):</p>
              <ol className="list-decimal list-inside space-y-1 text-sm ml-4 mb-4">
                <li>Player must pass <code>R1</code> (active) and <code>R2</code> (not excluded from auto-assign).</li>
                <li>Not already in this game.</li>
                <li><code>R5</code> &mdash; not already assigned to another game on the same date (including Solo).</li>
                <li><code>R7</code> &mdash; still owed games this week (<code>freq &minus; wtd &gt; 0</code>), or is a 2+ player.</li>
                <li><code>R3</code> &mdash; not on a blocked day of the week.</li>
                <li><code>R4</code> &mdash; not on vacation during the game date.</li>
                <li><code>R9</code> &mdash; not in an early game if their &ldquo;no early games&rdquo; flag is on.</li>
                <li><code>R10</code> &mdash; no consecutive-days conflict (if flagged &mdash; checks day before and day after).</li>
                <li><code>R6</code> &mdash; no do-not-pair conflict with any player already assigned to this game (bidirectional).</li>
                <li><code>R8</code> &mdash; A+C composition rule: only AACC is allowed; an A or C candidate is rejected when the game can&apos;t still resolve to AACC, and a B is rejected when the game already has both an A and a C.</li>
                <li><code>R12</code> &mdash; season cap (1x / 2x base contracts only).</li>
                <li><code>R13</code> &mdash; if the candidate would be an &ldquo;extras&rdquo; placement (Pass 2.5 / 3 / 3.5), it&apos;s gated when any other contracted player still has an unmet weekly contract with remaining playable days.</li>
              </ol>

              <h3 className="font-semibold mb-2">Step 3: Player Priority Scoring</h3>
              <p className="text-sm leading-relaxed mb-2">
                Each eligible player receives a priority score used for sorting (in this order):
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Must Play</span> (highest priority) &mdash; The
                  player is still owed games AND this is their only remaining playable day this week.
                </li>
                <li>
                  <span className="font-semibold">Games Owed</span> &mdash; Higher owed count =
                  higher priority (frequency &minus; WTD count).
                </li>
                <li>
                  <span className="font-semibold">Pairing Diversity</span> &mdash; The algorithm
                  loads all historical pairing counts from prior weeks. Candidates who have been
                  paired <span className="font-semibold">fewer</span> times with the players already
                  assigned to this game are preferred. This maximizes variety across the season.
                </li>
                <li>
                  <span className="font-semibold">Playable Days Left</span> &mdash; Fewer remaining
                  options = higher priority (most constrained players assigned first).
                </li>
                <li>
                  <span className="font-semibold">STD Deficit</span> &mdash; Higher deficit =
                  higher priority (expected games &minus; actual season-to-date count).
                </li>
                <li>
                  <span className="font-semibold">Random Tiebreaker</span> &mdash; When all other
                  factors are equal, a random tiebreaker prevents alphabetical bias and improves
                  pairing variety over time.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Step 4: Day Ordering (Tightest First)</h3>
              <p className="text-sm leading-relaxed mb-4">
                Days are processed in order of <span className="font-semibold">tightest surplus
                first</span> &mdash; the day with the smallest difference between available players
                and slots needed is assigned first. This ensures scarce 2+ players are allocated
                where most needed before less constrained days.
              </p>

              <h3 className="font-semibold mb-2">Step 5: Skill-Level Composition Rules</h3>
              <p className="text-sm leading-relaxed mb-2">
                As each game slot is filled, the algorithm checks the current game composition
                and applies A/C protection rules to maintain balanced skill levels:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">A-protection</span> &mdash; If the game already
                  contains a C-level player, A-level players are blocked from being added (unless
                  the game already has 2 B-level players and 0 A-level players, which provides
                  sufficient buffering).
                </li>
                <li>
                  <span className="font-semibold">C-protection</span> &mdash; If the game already
                  contains an A-level player, C-level players are blocked from being added (unless
                  the game already has 2 B-level players and 0 C-level players).
                </li>
                <li>
                  <span className="font-semibold">B &amp; D players</span> &mdash; B and D players
                  are never blocked by composition rules. They form the bridge between A and C
                  groups and fill all game types freely.
                </li>
              </ul>
              <p className="text-sm leading-relaxed mb-4">
                These rules are applied per-slot as the game fills, allowing natural groupings to
                emerge: A/B games, B/C games, all-B games, and (rarely) mixed A+C games when at
                least 2 B players provide a buffer. As of v1.204 the exact set of allowed
                compositions is admin-tunable via the checkbox grid on Season Setup (see
                &ldquo;Allowed Skill-Level Compositions&rdquo; above) &mdash; the description here
                reflects the shipped default.
              </p>

              <h3 className="font-semibold mb-2">Step 6: Multi-Pass Assignment</h3>
              <p className="text-sm leading-relaxed mb-2">
                For each game slot, the algorithm runs a series of passes. Each pass only fires if the previous one found no eligible players:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Pass 1: First-game-only</span> &mdash; Only players
                  with zero Don&apos;s games this week (WTD = 0). Ensures every contracted player gets
                  at least one game before anyone gets a second.
                </li>
                <li>
                  <span className="font-semibold">Pass 2: Base-owed</span> &mdash; Players who still
                  are owed games (frequency &minus; WTD &gt; 0). 2+ players capped at 2 games per week.
                </li>
                <li>
                  <span className="font-semibold">Pass 2.5: Front-loading</span> &mdash; Players with
                  upcoming vacations get a boosted weekly target (up to freq+1) to accumulate extra
                  games before their absence. Applies to all contract types including 2+.
                </li>
                <li>
                  <span className="font-semibold">Pass 2.8: C-adjacent fill</span> &mdash; Only fires
                  when the game already has at least one C-level player. Any A/B player is eligible
                  (the cGamesOk checkbox no longer gates this pass as of v1.212) as long as they
                  haven&apos;t reached their season allowance &mdash; their per-player <em>Max
                  C-games / season</em> if set, otherwise the season&apos;s C games minimum &mdash;
                  and haven&apos;t already played a C-adjacent game this week (1-per-week hard cap).
                  1x A players are never eligible (hard composition block).
                </li>
                <li>
                  <span className="font-semibold">Pass 3: Extras</span> (optional, checkbox) &mdash; Allows
                  2+ players beyond their weekly minimum of 2 games.
                </li>
                <li>
                  <span className="font-semibold">Pass 3.5: STD catchup</span> (optional, checkbox) &mdash;
                  During full-season auto-assign only: after the initial pass completes all weeks, a second
                  pass fills remaining empty slots with contracted players who have a season-total deficit
                  (STD: behind on their 36-week contract).
                </li>
                <li>
                  <span className="font-semibold">Pass 4: Subs</span> (optional, checkbox) &mdash; Allows
                  substitute (frequency 0) players to fill any remaining empty slots.
                </li>
              </ol>
              <p className="text-sm leading-relaxed mb-4">
                If no eligible player is found after all enabled passes, the slot is left empty for
                manual assignment. The log indicates the last pass used and suggests enabling additional
                passes if slots remain unfilled.
              </p>

              <h3 className="font-semibold mb-2">Step 7: Summary &amp; Logging</h3>
              <p className="text-sm leading-relaxed">
                After processing all games, the algorithm reports total slots filled, unfilled slots,
                the last pass used, and a per-day log of warnings. Each special-pass assignment is
                tagged with its pass number (e.g., [Pass 2.5], [Pass 2.8], [Pass 3.5]) for easy
                identification in the log.
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
                  Stable-sorts by <span className="font-semibold">normalized deficit</span>{" "}
                  descending. The raw deficit is (share frequency &times; current week) &minus;
                  actual assignments. This is then{" "}
                  <span className="font-semibold">divided by the player&apos;s frequency</span>{" "}
                  (1.0 for full-share, 0.5 for half-share) so both types compete on equal footing.
                  Without normalization, full-share players always have larger absolute deficits and
                  win every tiebreak, causing half-share players to fall behind (e.g., 15 games
                  instead of 18 over a 36-week season). With normalization, a half-share player who
                  is 1 game behind (normalized = 2.0) correctly ranks above a full-share player who
                  is 1 game behind (normalized = 1.0).
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
              <p className="text-sm leading-relaxed mb-4">
                Use the &ldquo;Balance Solo Balls&rdquo; and &ldquo;Balance Don&apos;s Balls&rdquo; buttons on the
                Season Setup page. These apply changes season-wide and show a per-player summary table.
                Ball balancing also runs automatically as the final step of full-season Don&apos;s auto-assign.
              </p>
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
                  Early games (9:00 AM) are highlighted with a pale yellow background for
                  easy identification.
                </li>
                <li>
                  <span className="font-semibold">Exceptions</span> &mdash; A filtered report showing only games with violations.
                  Runs compliance checks across all weeks and also detects incomplete games and composition issues (A+C without 2 B bridges).
                  Each game row includes an Exception column showing the cause in red (errors) or amber (warnings).
                  A summary at the bottom shows total games with issues and error/warning counts.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Games By Player</h3>
              <p className="text-sm leading-relaxed mb-4">
                A per-player listing showing every game assignment for the season. Each entry
                includes the date, time, court number, and co-players. Useful for distributing
                individual schedules to players.
              </p>

              <h3 className="font-semibold mb-2">Player Statistics</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Separate reports for Don&apos;s Group and Solo Group.
                </li>
                <li>
                  Don&apos;s Group columns: Player, Contract, STD (season total games), Deficit
                  (games still owed against the 36-week contract &mdash; shown as a dash when at
                  or above contract), Extra (games beyond expected), Balls (bringing count), Vac
                  Games (game dates lost to vacation, excluding blocked days and holidays, capped
                  per-week at contract frequency), and Made Up Vac (weeks where the player was
                  assigned more games than their contract &mdash; the surplus count).
                </li>
                <li>
                  Includes summary tables by skill level and by contract type.
                </li>
                <li>
                  The totals-row Deficit sums only positive deficits, so over-contract play in
                  some players doesn&apos;t mask the shortfall in others.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Weekly Game Counts</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  A landscape matrix with one row per active, auto-assignable player and one
                  column per week of the season. Each cell shows how many Don&apos;s games that
                  player was assigned that week (a dot for zero).
                </li>
                <li>
                  Each player name is followed by the contract tier in parentheses &mdash; e.g.
                  <code>Smith (2x+)</code> &mdash; so you can see the baseline at a glance.
                </li>
                <li>
                  <span className="font-semibold">Green fill</span> highlights cells where the
                  player exceeded their basic weekly contract (1x over 1, 2x over 2, sub over 0).
                  Makes over-contract weeks stand out at a glance.
                </li>
                <li>
                  Players with <span className="font-semibold">Include in auto-assign</span>{" "}
                  unchecked are dropped from this report.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Pairing Matrix</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  An N&times;N grid showing how many Don&apos;s group games each pair of players shared.
                </li>
                <li>
                  <span className="font-semibold">Color-coded bands</span> indicate pairing
                  frequency: green (low) &rarr; yellow &rarr; orange &rarr; red (high), making it
                  easy to spot over-paired or under-paired combinations at a glance.
                </li>
                <li>
                  Do-not-pair violations are highlighted in red.
                </li>
                <li>
                  <span className="font-semibold">Hide A-level columns</span> checkbox &mdash;
                  A-level players are the largest group and pair with each other constantly,
                  which can crowd out the B/C pairing detail. Check this to drop A-level players
                  from the column axis entirely, shrinking the grid to B/C columns only. Rows are
                  unaffected, so A-player rows still show their A+C and A+B pairing counts against
                  the remaining columns &mdash; only the A+A columns disappear.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Composition Analysis</h3>
              <p className="text-sm leading-relaxed mb-4">
                Shows the skill-level composition breakdown of all completed games (e.g., AABB,
                ABBB, BBCC, BBBC). Includes detail on A+C combination occurrences to help
                evaluate whether composition rules are working as intended.
              </p>

              <h3 className="font-semibold mb-2">Players List</h3>
              <p className="text-sm leading-relaxed mb-4">
                A printable roster of all active contract players and substitutes with contact info.
              </p>

              <h3 className="font-semibold mb-2">Player List Internal Report</h3>
              <p className="text-sm leading-relaxed mb-4">
                All players and subs with skill level, contract type, and blocked days. Useful for
                next-season planning and evaluating player availability patterns.
              </p>

              <h3 className="font-semibold mb-2">Player Availability</h3>
              <p className="text-sm leading-relaxed mb-4">
                Active players with the tennis-week days they can play (blocked days excluded) and
                their vacation date ranges, one row per player. Vacation lists wrap onto follow-up
                lines for players with many entries.
              </p>

              <h3 className="font-semibold mb-2">C-Slot Diagnosis</h3>
              <p className="text-sm leading-relaxed mb-4">
                A permanent (non-PDF) diagnostic page at{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  /reports/c-slots
                </span>
                . For every incomplete Don&apos;s game involving C players, walks every candidate
                A/B player and shows which rule blocked them (season/per-player C-games ceiling,
                weekly 1-per-week C cap, AACC composition, DNP, vacation, blocked day). Immutable
                reasons &mdash; blocked day, vacation, played-same-date, do-not-pair &mdash; are
                filtered out by default so only tunable, algorithmic causes remain visible. Use
                this to tune the Season Setup C games minimum and per-player ceilings.
              </p>

              <h3 className="font-semibold mb-2">Incomplete Games</h3>
              <p className="text-sm leading-relaxed mb-4">
                All games with fewer than 4 assigned players across the season. Shows week, game
                number, court/time, currently assigned players, and the reason the game
                wasn&apos;t fully filled (cap-blocked vs. no eligible candidates).
              </p>

              <h3 className="font-semibold mb-2">Twilio SMS Cost Estimate</h3>
              <p className="text-sm leading-relaxed mb-4">
                A live estimator page at{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  /twilio-cost
                </span>{" "}
                showing accrued and projected Twilio cost &mdash; setup, monthly, and per-message
                fees &mdash; based on actual SMS sends logged this season.
              </p>

              <h3 className="font-semibold mb-2">Court Schedule</h3>
              <p className="text-sm leading-relaxed mb-4">
                A printable PDF of the weekly court layout showing all days, times, court numbers,
                and group assignments (Don&apos;s or Solo).
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
                The Communications page allows sending bulk email and/or SMS to players via Gmail
                SMTP. It has three tabs: Compose, Templates, and History, plus a Daily Reminders
                section inside Email Settings.
              </p>

              <h3 className="font-semibold mb-2">Email Settings</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">From Name</span>, <span className="font-semibold">Reply-To</span>,
                  <span className="font-semibold">Test Email</span>, <span className="font-semibold">Test Phone</span>,
                  <span className="font-semibold">Test Carrier</span>, and <span className="font-semibold">Questionnaire URL</span>.
                  Test contact is used by the Test recipient group.
                </li>
                <li>
                  <span className="font-semibold">Daily game reminders</span> &mdash; see its own
                  subsection below.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Compose</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Recipient Groups</span> &mdash; ALL, Contract
                  Players, Subs, Owes Deposit (contract players whose deposits are below their
                  tier&apos;s standard amount), Players (multi-select), or Test.
                </li>
                <li>
                  <span className="font-semibold">Send Via</span> &mdash; four channel choices:
                  <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                    <li><span className="font-semibold">Email + Text</span> &mdash; send to both channels for players who have both</li>
                    <li><span className="font-semibold">Email only</span></li>
                    <li><span className="font-semibold">Text only</span> &mdash; players without phone+carrier get email as fallback</li>
                    <li><span className="font-semibold">Text → Email on failure</span> &mdash; try SMS first; if the SMS send returns an error, that recipient gets the message via email instead. Each recipient is delivered exactly once.</li>
                  </ul>
                </li>
                <li>
                  <span className="font-semibold">Mail-merge tokens</span> &mdash; type{" "}
                  <code>{"{firstName}"}</code>, <code>{"{balance}"}</code>,{" "}
                  <code>{"{depositDue}"}</code>, etc. in the subject or body and each recipient
                  gets their own values substituted in. The Tip line below the Message textarea
                  lists every available token.
                </li>
                <li>
                  <span className="font-semibold">Conditional sections</span> &mdash; wrap text in{" "}
                  <code>{"{#if extraFee}…{/if}"}</code> to hide that block for recipients whose
                  value is zero or empty. Example:{" "}
                  <code>{"{#if extraFee}You owe {extraFee} for extras.{/if}"}</code>.
                </li>
                <li>
                  <span className="font-semibold">Include personal calendar link</span> &mdash;
                  appends a per-recipient <code>webcal://</code> subscription link so the player
                  can add a Brooklake Tennis calendar that auto-updates.
                </li>
                <li>
                  Optionally attach files (email only). Size cap is 10&nbsp;MB total.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">Templates</h3>
              <p className="text-sm leading-relaxed mb-2">
                Create, edit, and delete reusable templates with a name, subject, and body.
                Templates are global (not per-season). The editor includes the same mail-merge
                cheatsheet as Compose.
              </p>
              <p className="text-sm leading-relaxed mb-4">
                <span className="font-semibold">Load</span> drops a template into the Compose
                tab&apos;s subject and body. The Daily Reminders section can also reference a
                template by name.
              </p>

              <h3 className="font-semibold mb-2">Daily Game Reminders</h3>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4 mb-4">
                <li>
                  Once a day around <span className="font-semibold">6 PM Eastern</span>, every
                  player who has a normal game tomorrow gets an automatic reminder. Send time is
                  fixed at the cron level (Vercel Hobby plan only allows daily crons).
                </li>
                <li>
                  <span className="font-semibold">Enable / disable</span> toggle in the Daily
                  Reminders subsection of Email Settings.
                </li>
                <li>
                  <span className="font-semibold">Channel</span> &mdash; same four options as
                  Compose (Email+Text / Email only / Text only / Text → Email on failure).
                </li>
                <li>
                  <span className="font-semibold">Template</span> &mdash; pick any saved template
                  from the dropdown, or leave it on &ldquo;Built-in default&rdquo; and edit the
                  inline textarea. Variables: <code>{"{firstName}"}</code>, <code>{"{date}"}</code>,
                  <code>{"{time}"}</code>, <code>{"{court}"}</code>, <code>{"{partners}"}</code>,
                  <code>{"{group}"}</code>.
                </li>
                <li>
                  <span className="font-semibold">Send test reminder</span> &mdash; pick a player
                  and click &ldquo;Send test now&rdquo; to fire one reminder immediately using
                  the same code path as the cron. If the player has any upcoming game, real
                  game data is substituted; otherwise sample placeholders are used so you can
                  preview formatting before the season starts.
                </li>
              </ul>

              <h3 className="font-semibold mb-2">History</h3>
              <p className="text-sm leading-relaxed">
                View all sent emails / texts with date, subject, group, recipient count, and from
                name. Daily-reminder runs appear as the &ldquo;Daily Reminder (auto)&rdquo; group.
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

              <h3 className="font-semibold mb-2">Backup Destinations (in order tried)</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm ml-4 mb-4">
                <li>
                  <span className="font-semibold">Local filesystem</span> &mdash; works only when
                  running the dev server from your laptop. Writes to the directories configured
                  on Season Setup.
                </li>
                <li>
                  <span className="font-semibold">Dropbox</span> &mdash; when the{" "}
                  <code>DROPBOX_REFRESH_TOKEN</code>, <code>DROPBOX_APP_KEY</code>, and{" "}
                  <code>DROPBOX_APP_SECRET</code> env vars are configured (in Vercel),
                  every backup uploads to{" "}
                  <code>/teich/tennis/&lt;season-label&gt;/scheduler/backup/&lt;folder&gt;/</code>.
                  The season label (e.g. <code>2026-27</code>) is auto-derived from the
                  season&apos;s start year. Older folders inside the season backup directory are
                  auto-pruned so only the 3 most recent remain.
                </li>
                <li>
                  <span className="font-semibold">ZIP download</span> &mdash; if neither
                  destination above worked, the backup streams back to the browser as a ZIP that
                  lands in your Downloads folder.
                </li>
              </ol>
              <p className="text-sm leading-relaxed mb-4">
                The result banner after Backup All lists every destination that succeeded,
                including the Dropbox path, file count, and pruned-folder summary.
              </p>

              <h3 className="font-semibold mb-2">Automatic Backup on Reset</h3>
              <p className="text-sm leading-relaxed mb-4">
                When resetting the season, a backup is automatically run before the reset
                proceeds. If the backup fails completely, the reset is cancelled.
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
