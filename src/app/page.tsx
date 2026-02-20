export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Tennis Club Scheduler</h1>
      <p className="text-muted mb-8">
        Manage your tennis club season, court schedules, and player assignments.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href="/season"
          className="border border-border rounded-lg p-6 hover:border-primary transition-colors"
        >
          <h2 className="font-semibold mb-2">Season Setup</h2>
          <p className="text-sm text-muted">
            Configure season dates, holidays, and makeup weeks.
          </p>
        </a>
        <a
          href="/courts"
          className="border border-border rounded-lg p-6 hover:border-primary transition-colors"
        >
          <h2 className="font-semibold mb-2">Court Schedule</h2>
          <p className="text-sm text-muted">
            Define weekly court slots, times, and group assignments.
          </p>
        </a>
        <a
          href="/players"
          className="border border-border rounded-lg p-6 hover:border-primary transition-colors"
        >
          <h2 className="font-semibold mb-2">Players</h2>
          <p className="text-sm text-muted">
            Manage player roster, constraints, and availability.
          </p>
        </a>
      </div>
    </div>
  );
}
