import { APP_VERSION } from "@/lib/version";

export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Tennis Club Scheduler <span className="text-sm font-normal text-gray-600">v{APP_VERSION}</span></h1>
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
      </div>
    </div>
  );
}
