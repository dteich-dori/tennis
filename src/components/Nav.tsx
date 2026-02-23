"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/season", label: "Season Setup" },
  { href: "/courts", label: "Court Schedule" },
  { href: "/players", label: "Players" },
  { href: "/schedule", label: "Schedule" },
  { href: "/reports", label: "Reports" },
  { href: "/communications", label: "Communications" },
  { href: "/user-manual", label: "User Manual" },
  { href: "/developer-guide", label: "Developer Guide" },
];

export function Nav() {
  const pathname = usePathname();

  // Hide nav on login page
  if (pathname === "/login") return null;

  return (
    <nav className="w-56 border-r border-border bg-gray-50 p-4 flex flex-col gap-1">
      <div className="text-lg font-bold mb-6 px-3">Tennis Scheduler</div>
      {links.map((link) => {
        const isActive =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-2 rounded text-sm transition-colors ${
              isActive
                ? "bg-primary text-white"
                : "text-foreground hover:bg-gray-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
