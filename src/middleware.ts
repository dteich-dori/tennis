import { NextRequest, NextResponse } from "next/server";

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (
    pathname === "/login" ||
    pathname === "/api/auth" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/swap-manifest.json" ||
    pathname === "/icon.svg" ||
    pathname === "/icon-192.png" ||
    pathname === "/icon-512.png" ||
    pathname === "/apple-touch-icon.png" ||
    pathname.startsWith("/swap-icon") || // Swap Finder home-screen icons — must be
                                         // fetchable without a login or iOS shows a
                                         // screenshot instead of the tile
    pathname.startsWith("/api/ics/") || // public calendar subscriptions — protected by per-player token
    pathname.startsWith("/calendar/subscribe/") || // public landing page that redirects to webcal://
    pathname.startsWith("/online-schedule") || // public player-facing schedule view
    pathname.startsWith("/swap-finder") || // public read-only swap suggestions (no writes)
    pathname.startsWith("/api/public/") || // public API endpoints
    pathname.startsWith("/api/migrate/") || // one-shot DB migration endpoints
    pathname === "/join" || // public sign-up + SMS opt-in landing (A2P 10DLC CTA)
    pathname === "/sms-terms" || // public combined SMS terms (legacy, kept for bookmarks)
    pathname === "/privacy" || // public Privacy Policy (A2P 10DLC required URL)
    pathname === "/terms" // public Terms of Service (A2P 10DLC required URL)
  ) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  const sitePassword = process.env.SITE_PASSWORD;

  // URL bypass: ?auth=<BYPASS_TOKEN> sets the cookie and strips the param.
  const bypassToken = process.env.BYPASS_TOKEN;
  const authParam = request.nextUrl.searchParams.get("auth");
  if (authParam && bypassToken && authParam === bypassToken && secret && sitePassword) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("auth");
    const response = NextResponse.redirect(clean);
    const expected = await hmacHex(secret, sitePassword);
    response.cookies.set("auth-token", expected, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year for bypass users
    });
    return response;
  }

  const token = request.cookies.get("auth-token")?.value;

  if (!token || !secret || !sitePassword) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Validate the token is a valid HMAC of the password
  const expected = await hmacHex(secret, sitePassword);

  if (token !== expected) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
