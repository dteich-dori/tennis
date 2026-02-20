"use client";

// Developer Guide for Tennis Scheduler
// Technical reference for development commands, project structure, and architecture.

const tocSections = [
  { id: "tech-stack", label: "Technology Stack" },
  { id: "project-structure", label: "Project Structure" },
  { id: "npm-commands", label: "NPM Commands" },
  { id: "database-commands", label: "Database Commands" },
  { id: "git-commands", label: "Git Commands" },
  { id: "server-management", label: "Server Management" },
  { id: "database-schema", label: "Database Schema" },
  { id: "api-routes", label: "API Routes" },
  { id: "dev-workflow", label: "Development Workflow" },
  { id: "config-files", label: "Configuration Files" },
  { id: "dependencies", label: "Key Dependencies" },
  { id: "dev-vs-prod", label: "Dev vs Production" },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export default function DeveloperGuidePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Developer Guide</h1>

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
          <p className="text-sm leading-relaxed text-muted">
            This guide documents the technology stack, project structure, key development
            commands, and workflows used to build and maintain the Tennis Scheduler application.
          </p>

          {/* ===== TECHNOLOGY STACK ===== */}
          <section id="tech-stack" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Technology Stack</h2>
              <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                <li>
                  <span className="font-semibold">Framework:</span> Next.js 16 (App Router) with
                  React 19 and TypeScript
                </li>
                <li>
                  <span className="font-semibold">Styling:</span> Tailwind CSS 4
                </li>
                <li>
                  <span className="font-semibold">Database:</span> SQLite via Drizzle ORM
                  (local: better-sqlite3, production: Cloudflare D1)
                </li>
                <li>
                  <span className="font-semibold">PDF Generation:</span> jsPDF
                </li>
                <li>
                  <span className="font-semibold">Deployment Target:</span> Cloudflare Workers
                  (via OpenNext)
                </li>
                <li>
                  <span className="font-semibold">Package Manager:</span> npm
                </li>
                <li>
                  <span className="font-semibold">Version Control:</span> Git
                </li>
                <li>
                  <span className="font-semibold">Dev Tool:</span> Claude Code (AI-assisted
                  development)
                </li>
              </ul>
            </div>
          </section>

          {/* ===== PROJECT STRUCTURE ===== */}
          <section id="project-structure" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Project Structure</h2>
              <div className="bg-gray-50 border border-border rounded px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed">{`TennisScheduler/
└── app/                          ← Application root
    ├── src/
    │   ├── app/                  ← Next.js App Router
    │   │   ├── api/              ← Backend API routes
    │   │   │   ├── courts/       ← Court schedule CRUD
    │   │   │   ├── games/        ← Games, assignments, compliance,
    │   │   │   │                    stats, ball balancing
    │   │   │   ├── holidays/     ← Holiday CRUD
    │   │   │   ├── players/      ← Player CRUD + CSV import
    │   │   │   └── seasons/      ← Season CRUD
    │   │   ├── courts/           ← Court Schedule page
    │   │   ├── user-manual/      ← User Manual page
    │   │   ├── developer-guide/  ← This developer guide
    │   │   ├── players/          ← Players management page
    │   │   ├── reports/          ← PDF report generation page
    │   │   ├── schedule/         ← Schedule / game assignment page
    │   │   ├── season/           ← Season setup page
    │   │   ├── layout.tsx        ← Root layout with navigation
    │   │   ├── page.tsx          ← Home page
    │   │   └── globals.css       ← Global styles
    │   ├── components/
    │   │   └── Nav.tsx           ← Navigation bar
    │   ├── db/
    │   │   ├── schema/           ← Drizzle ORM table definitions
    │   │   │   ├── players.ts    ← players, blockedDays,
    │   │   │   │                    vacations, doNotPair
    │   │   │   ├── games.ts      ← games, gameAssignments,
    │   │   │   │                    ballCounts
    │   │   │   ├── seasons.ts    ← seasons
    │   │   │   ├── holidays.ts   ← holidays
    │   │   │   ├── courtSchedules.ts
    │   │   │   └── index.ts      ← Schema barrel export
    │   │   ├── getDb.ts          ← Dev DB singleton (better-sqlite3)
    │   │   └── index.ts          ← Production DB factory (D1)
    │   └── lib/
    │       └── reports/          ← PDF report generators
    │           ├── gamesByDatePdf.ts
    │           ├── playerStatsPdf.ts
    │           └── playersListPdf.ts
    ├── drizzle/
    │   └── migrations/           ← SQL migration files
    ├── package.json
    ├── drizzle.config.ts         ← Drizzle ORM configuration
    ├── next.config.ts            ← Next.js configuration
    ├── wrangler.jsonc            ← Cloudflare Workers config
    ├── tsconfig.json             ← TypeScript configuration
    └── .wrangler/state/          ← Local D1 database files`}</div>
            </div>
          </section>

          {/* ===== NPM COMMANDS ===== */}
          <section id="npm-commands" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">NPM Commands</h2>
              <p className="text-sm leading-relaxed mb-2">
                All commands are run from the application root directory:{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  /Users/doriteich/TennisScheduler/app
                </span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Command</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npm run dev</td>
                      <td className="px-3 py-2 border-b border-border">
                        Start the development server (Turbopack). Access at{" "}
                        <span className="font-mono text-xs">http://localhost:3000</span>
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npm run build</td>
                      <td className="px-3 py-2 border-b border-border">
                        Compile the application for production (optimized, no hot-reload overhead)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npm start</td>
                      <td className="px-3 py-2 border-b border-border">
                        Run the compiled production build (must run{" "}
                        <span className="font-mono text-xs">npm run build</span> first)
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npm run lint</td>
                      <td className="px-3 py-2 border-b border-border">
                        Run ESLint to check for code quality issues
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npm run preview</td>
                      <td className="px-3 py-2 border-b border-border">
                        Build and preview using the Cloudflare Workers runtime locally
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npm run deploy</td>
                      <td className="px-3 py-2 border-b border-border">
                        Build and deploy to Cloudflare Workers (production)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npm run cf-typegen</td>
                      <td className="px-3 py-2 border-b border-border">
                        Regenerate Cloudflare environment TypeScript types
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== DATABASE COMMANDS ===== */}
          <section id="database-commands" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Database Commands (Drizzle)</h2>
              <p className="text-sm leading-relaxed mb-2">
                The database schema is managed with Drizzle ORM. Schema files live in{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  src/db/schema/
                </span>{" "}
                and migrations are generated into{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  drizzle/migrations/
                </span>.
              </p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border border-border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Command</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npx drizzle-kit generate</td>
                      <td className="px-3 py-2 border-b border-border">
                        Generate SQL migration files from schema changes
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npx drizzle-kit migrate</td>
                      <td className="px-3 py-2 border-b border-border">
                        Apply pending migrations to the database
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npx drizzle-kit studio</td>
                      <td className="px-3 py-2 border-b border-border">
                        Open Drizzle Studio &mdash; a visual database browser for inspecting tables and data
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">npx drizzle-kit push</td>
                      <td className="px-3 py-2 border-b border-border">
                        Push schema directly to database (skips migration files; useful for rapid prototyping)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 text-sm">
                <span className="font-semibold">Tip:</span> The Drizzle config file{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  drizzle.config.ts
                </span>{" "}
                points to the schema directory and migrations output folder. Configuration:{" "}
                dialect = sqlite, schema = ./src/db/schema, out = ./drizzle/migrations.
              </div>
            </div>
          </section>

          {/* ===== GIT COMMANDS ===== */}
          <section id="git-commands" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Git Commands</h2>
              <p className="text-sm leading-relaxed mb-2">
                The project uses Git for version control. All commands are run from the
                repository root:{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  /Users/doriteich/TennisScheduler
                </span>
              </p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border border-border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Command</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">git status</td>
                      <td className="px-3 py-2 border-b border-border">
                        Show which files have been changed, added, or deleted
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">git diff</td>
                      <td className="px-3 py-2 border-b border-border">
                        Show detailed line-by-line changes in modified files
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">git add &lt;files&gt;</td>
                      <td className="px-3 py-2 border-b border-border">
                        Stage specific files for the next commit
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">git commit -m &quot;message&quot;</td>
                      <td className="px-3 py-2 border-b border-border">
                        Save staged changes with a descriptive message
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">git log --oneline</td>
                      <td className="px-3 py-2 border-b border-border">
                        View commit history (one line per commit)
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">git checkout &lt;file&gt;</td>
                      <td className="px-3 py-2 border-b border-border">
                        Discard uncommitted changes to a file (revert to last commit)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm leading-relaxed mb-4">
                <span className="font-semibold">Commit history</span> follows a descriptive
                pattern: each commit message summarizes what was added or changed. Example commits
                from this project:
              </p>
              <div className="bg-gray-50 border border-border rounded px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed">{`5f62679 Phase 1: Tennis Scheduler foundation
0be085f Phase 1 polish: vacation dates, undo delete, reset season
ae2759a Phase 2: Core scheduling - game generation, weekly view
8358ccb Phase 2 polish: Reports tab, CSV import, stability
36d73d6 Stable backup 2026-02-12: Group-aware scheduling, compliance
5269b69 Add Must Play detection and Player Info panel
628d6c6 Add clear game slot, bonus mode, and bonus-all
a668e3c Add ball balancing feature
7cfe044 Add Games By Date PDF report (compact + worksheet)
9efb76a Manuals tab, Does Not Play With, dropdown sort
94a0fa6 Add File Locations, Backup, and Crash Recovery`}</div>
            </div>
          </section>

          {/* ===== SERVER MANAGEMENT ===== */}
          <section id="server-management" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Server Management Commands</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Command</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs whitespace-nowrap">pkill -f &quot;next dev&quot;</td>
                      <td className="px-3 py-2 border-b border-border">
                        Kill a running/crashed development server process
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs whitespace-nowrap">rm -f .next/dev/lock</td>
                      <td className="px-3 py-2 border-b border-border">
                        Remove the dev server lock file (required after a crash)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs whitespace-nowrap">npm run dev</td>
                      <td className="px-3 py-2 border-b border-border">
                        (Re)start the development server
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs whitespace-nowrap">npm run build &amp;&amp; npm start</td>
                      <td className="px-3 py-2 border-b border-border">
                        Build and run in production mode (faster, uses less memory)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs whitespace-nowrap">npm install</td>
                      <td className="px-3 py-2 border-b border-border">
                        Install or restore all project dependencies (run after cloning or updating)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== DATABASE SCHEMA ===== */}
          <section id="database-schema" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Database Schema</h2>
              <p className="text-sm leading-relaxed mb-2">
                The SQLite database contains 9 tables managed by Drizzle ORM. Schema definitions
                are in{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  src/db/schema/
                </span>:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Table</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Schema File</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">seasons</td>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">seasons.ts</td>
                      <td className="px-3 py-2 border-b border-border">Season dates (start, end, 36 weeks)</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">holidays</td>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">holidays.ts</td>
                      <td className="px-3 py-2 border-b border-border">Holiday dates within a season</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">court_schedules</td>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">courtSchedules.ts</td>
                      <td className="px-3 py-2 border-b border-border">Weekly recurring court slots (day, time, court#)</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">players</td>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">players.ts</td>
                      <td className="px-3 py-2 border-b border-border">Player profiles, frequency, skill, status</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">player_blocked_days</td>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">players.ts</td>
                      <td className="px-3 py-2 border-b border-border">Days of the week a player cannot play</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">player_vacations</td>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">players.ts</td>
                      <td className="px-3 py-2 border-b border-border">Vacation date ranges (start, return)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">player_do_not_pair</td>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">players.ts</td>
                      <td className="px-3 py-2 border-b border-border">Player pairing restrictions (directional)</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">games</td>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">games.ts</td>
                      <td className="px-3 py-2 border-b border-border">Game slots (date, time, court, week, group, status)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">game_assignments</td>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">games.ts</td>
                      <td className="px-3 py-2 border-b border-border">Player-to-game slot assignments (4 slots per game)</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">ball_counts</td>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">games.ts</td>
                      <td className="px-3 py-2 border-b border-border">Ball-bringing count per player per season</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== API ROUTES ===== */}
          <section id="api-routes" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">API Routes</h2>
              <p className="text-sm leading-relaxed mb-2">
                All API routes are under{" "}
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  src/app/api/
                </span>{" "}
                and follow REST conventions (GET, POST, PUT, DELETE):
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Route</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Methods</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/seasons</td>
                      <td className="px-3 py-2 border-b border-border text-xs">GET POST PUT DELETE</td>
                      <td className="px-3 py-2 border-b border-border">Season CRUD</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/holidays</td>
                      <td className="px-3 py-2 border-b border-border text-xs">GET POST DELETE</td>
                      <td className="px-3 py-2 border-b border-border">Holiday CRUD</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/courts</td>
                      <td className="px-3 py-2 border-b border-border text-xs">GET POST PUT DELETE</td>
                      <td className="px-3 py-2 border-b border-border">Court schedule CRUD</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/players</td>
                      <td className="px-3 py-2 border-b border-border text-xs">GET POST PUT DELETE</td>
                      <td className="px-3 py-2 border-b border-border">Player CRUD</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/players/import</td>
                      <td className="px-3 py-2 border-b border-border text-xs">POST</td>
                      <td className="px-3 py-2 border-b border-border">Bulk CSV player import</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/games</td>
                      <td className="px-3 py-2 border-b border-border text-xs">GET POST DELETE</td>
                      <td className="px-3 py-2 border-b border-border">Game CRUD</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/games/generate</td>
                      <td className="px-3 py-2 border-b border-border text-xs">POST</td>
                      <td className="px-3 py-2 border-b border-border">Generate 36 weeks of game slots</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/games/assign</td>
                      <td className="px-3 py-2 border-b border-border text-xs">POST</td>
                      <td className="px-3 py-2 border-b border-border">Assign/remove players from game slots</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/games/compliance</td>
                      <td className="px-3 py-2 border-b border-border text-xs">GET POST</td>
                      <td className="px-3 py-2 border-b border-border">Run 12-rule compliance check</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/games/stats</td>
                      <td className="px-3 py-2 border-b border-border text-xs">GET</td>
                      <td className="px-3 py-2 border-b border-border">Player statistics (YTD, deficit, balls)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/games/counts</td>
                      <td className="px-3 py-2 border-b border-border text-xs">GET</td>
                      <td className="px-3 py-2 border-b border-border">Game counts per player</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">/api/games/balance-balls</td>
                      <td className="px-3 py-2 border-b border-border text-xs">POST</td>
                      <td className="px-3 py-2 border-b border-border">Optimize ball-bringing assignments</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== DEVELOPMENT WORKFLOW ===== */}
          <section id="dev-workflow" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Development Workflow</h2>
              <p className="text-sm leading-relaxed mb-2">
                This application was developed using Claude Code as the AI-assisted development
                tool. The typical workflow:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-sm ml-4">
                <li>
                  <span className="font-semibold">Start the dev server</span> &mdash;{" "}
                  <span className="font-mono text-xs">npm run dev</span> from the app directory
                </li>
                <li>
                  <span className="font-semibold">Describe the feature</span> &mdash; Tell
                  Claude what to build or change in plain English
                </li>
                <li>
                  <span className="font-semibold">Claude writes the code</span> &mdash; Claude
                  edits the relevant files (pages, API routes, schema, reports)
                </li>
                <li>
                  <span className="font-semibold">Test in browser</span> &mdash; Refresh{" "}
                  <span className="font-mono text-xs">http://localhost:3000</span> to see changes
                  (hot-reload is automatic in dev mode)
                </li>
                <li>
                  <span className="font-semibold">Iterate</span> &mdash; Report bugs or request
                  adjustments; Claude fixes them
                </li>
                <li>
                  <span className="font-semibold">Commit and save</span> &mdash; Tell Claude
                  &ldquo;commit and save&rdquo; to create a Git checkpoint
                </li>
              </ol>
            </div>
          </section>

          {/* ===== CONFIGURATION FILES ===== */}
          <section id="config-files" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Key Configuration Files</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">File</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">package.json</td>
                      <td className="px-3 py-2 border-b border-border">
                        Dependencies, npm scripts, project metadata
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">next.config.ts</td>
                      <td className="px-3 py-2 border-b border-border">
                        Next.js settings: server packages (better-sqlite3), Turbopack, Cloudflare dev init
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">drizzle.config.ts</td>
                      <td className="px-3 py-2 border-b border-border">
                        Drizzle ORM: schema path, migration output, SQLite dialect
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">wrangler.jsonc</td>
                      <td className="px-3 py-2 border-b border-border">
                        Cloudflare Workers: D1 database binding, compatibility flags, deployment settings
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">tsconfig.json</td>
                      <td className="px-3 py-2 border-b border-border">
                        TypeScript: ES2024 target, strict mode, path alias @/* = ./src/*
                      </td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">postcss.config.mjs</td>
                      <td className="px-3 py-2 border-b border-border">
                        PostCSS with Tailwind CSS plugin
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">open-next.config.ts</td>
                      <td className="px-3 py-2 border-b border-border">
                        OpenNext configuration for Cloudflare deployment adapter
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== KEY DEPENDENCIES ===== */}
          <section id="dependencies" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Key Dependencies</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Package</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Version</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">next</td>
                      <td className="px-3 py-2 border-b border-border text-xs">16.1.5</td>
                      <td className="px-3 py-2 border-b border-border">React framework (App Router, API routes, SSR)</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">react / react-dom</td>
                      <td className="px-3 py-2 border-b border-border text-xs">19.1.5</td>
                      <td className="px-3 py-2 border-b border-border">UI library</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">drizzle-orm</td>
                      <td className="px-3 py-2 border-b border-border text-xs">0.45.1</td>
                      <td className="px-3 py-2 border-b border-border">Type-safe SQL ORM for SQLite</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">jspdf</td>
                      <td className="px-3 py-2 border-b border-border text-xs">4.1.0</td>
                      <td className="px-3 py-2 border-b border-border">Client-side PDF generation for reports</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">better-sqlite3</td>
                      <td className="px-3 py-2 border-b border-border text-xs">12.6.2</td>
                      <td className="px-3 py-2 border-b border-border">Local SQLite driver (dev only)</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">tailwindcss</td>
                      <td className="px-3 py-2 border-b border-border text-xs">4.x</td>
                      <td className="px-3 py-2 border-b border-border">Utility-first CSS framework</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">drizzle-kit</td>
                      <td className="px-3 py-2 border-b border-border text-xs">0.31.9</td>
                      <td className="px-3 py-2 border-b border-border">Schema migrations and database tooling</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">wrangler</td>
                      <td className="px-3 py-2 border-b border-border text-xs">4.63.0</td>
                      <td className="px-3 py-2 border-b border-border">Cloudflare Workers CLI (deploy, D1, dev)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-mono text-xs">@opennextjs/cloudflare</td>
                      <td className="px-3 py-2 border-b border-border text-xs">1.15.1</td>
                      <td className="px-3 py-2 border-b border-border">Next.js-to-Cloudflare Workers adapter</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== DEV VS PRODUCTION ===== */}
          <section id="dev-vs-prod" className="scroll-mt-8">
            <div className="border border-border rounded-lg p-6">
              <h2 className="font-semibold text-lg mb-4">Development vs Production Mode</h2>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border border-border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Feature</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Development (npm run dev)</th>
                      <th className="text-left px-3 py-2 border-b border-border font-semibold">Production (npm run build + start)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-semibold">Hot Reload</td>
                      <td className="px-3 py-2 border-b border-border">Yes &mdash; code changes appear instantly</td>
                      <td className="px-3 py-2 border-b border-border">No &mdash; requires rebuild</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-semibold">Speed</td>
                      <td className="px-3 py-2 border-b border-border">Slower (compiles on-the-fly)</td>
                      <td className="px-3 py-2 border-b border-border">Faster (pre-compiled)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-semibold">Memory</td>
                      <td className="px-3 py-2 border-b border-border">Higher (Turbopack + file watchers)</td>
                      <td className="px-3 py-2 border-b border-border">Lower (no dev overhead)</td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border-b border-border font-semibold">Stability</td>
                      <td className="px-3 py-2 border-b border-border">May crash under memory pressure</td>
                      <td className="px-3 py-2 border-b border-border">More stable for end-user sessions</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b border-border font-semibold">Use When</td>
                      <td className="px-3 py-2 border-b border-border">Actively developing features</td>
                      <td className="px-3 py-2 border-b border-border">Running the app for scheduling sessions</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 text-sm">
                <span className="font-semibold">Tip:</span> Use development mode when Claude is
                making code changes. Switch to production mode (
                <span className="font-mono text-xs">npm run build &amp;&amp; npm start</span>)
                when you want a stable, crash-free session for actual scheduling work.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
