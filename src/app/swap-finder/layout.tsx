import type { Metadata } from "next";

/**
 * Standalone layout: no site nav, and its own home-screen identity.
 *
 * This page is public and is used on a phone by someone who should
 * never land on an admin screen. The metadata below is what iOS reads
 * when the page is added to the Home Screen:
 *
 *   icons.apple            — the icon tile (blue arrows, not the green
 *                            tennis ball, so the two are distinct)
 *   appleWebApp.title      — the short label under the icon
 *   appleWebApp.capable    — opens without Safari's chrome, so it feels
 *                            like an app rather than a bookmark
 */
export const metadata: Metadata = {
  title: "Swap Finder",
  description: "Who can take a game, and what they can give back.",
  applicationName: "Swap Finder",
  appleWebApp: {
    capable: true,
    title: "Swap",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/swap-icon-192.png",
    apple: "/swap-icon-180.png",
  },
};

export default function SwapFinderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
