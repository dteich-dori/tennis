import Link from "next/link";
import { APP_VERSION } from "@/lib/version";

export default function Home() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Tennis Scheduler</h1>
      <p className="text-sm text-muted mb-8">v{APP_VERSION}</p>

      <div className="space-y-3">
        <Link
          href="/online-schedule"
          className="block px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">Online Schedule</span>
          <span className="text-sm text-gray-500 ml-2">
            View this week&apos;s games
          </span>
        </Link>

        <Link
          href="/schedule"
          className="block px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">Schedule</span>
          <span className="text-sm text-gray-500 ml-2">
            Manage game assignments
          </span>
        </Link>

        <Link
          href="/players"
          className="block px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">Players</span>
          <span className="text-sm text-gray-500 ml-2">
            Manage player roster
          </span>
        </Link>

        <Link
          href="/season"
          className="block px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">Season Setup</span>
          <span className="text-sm text-gray-500 ml-2">
            Configure season settings
          </span>
        </Link>

        <Link
          href="/reports"
          className="block px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">Reports</span>
          <span className="text-sm text-gray-500 ml-2">
            Generate schedule reports
          </span>
        </Link>
      </div>
    </div>
  );
}
