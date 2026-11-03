import { NextRequest, NextResponse } from "next/server";

/**
 * Web app manifest for ONE delegate's link.
 *
 * iOS honours a manifest's start_url over the page you are actually on, and
 * the root manifest says "/online-schedule" — so a home-screen icon added
 * from /swap-admin/<token> opened the schedule app instead. This manifest
 * starts at the token's own page. The token is already in the URL that
 * fetched this, so nothing new is revealed, and nothing is read from the
 * database.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const start = `/swap-admin/${token}`;
  return NextResponse.json(
    {
      name: "Swap Admin",
      short_name: "Swap",
      description: "Swap or give away a game.",
      start_url: start,
      scope: start,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#1d4ed8",
      icons: [
        { src: "/swap-icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/swap-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } }
  );
}
