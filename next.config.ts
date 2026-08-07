import type { NextConfig } from "next";

// The sandbox dev server (npm run dev:sandbox) gets its own build output
// directory so it never shares a .next cache with the regular dev server.
// NEXT_PUBLIC_* vars are inlined into the client bundle at compile time —
// sharing .next between two concurrently-running dev servers with
// different env vars caused the sandbox banner to leak into the
// production dev server (and vice versa) depending on which one compiled
// last.
const nextConfig: NextConfig = {
  distDir: process.env.DB_ENV === "sandbox" ? ".next-sandbox" : ".next",
};

export default nextConfig;
