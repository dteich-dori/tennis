import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev` (used in production path).
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
//
// Guard: only initialize once to prevent leaking Miniflare instances and
// orphaned workerd processes on every hot-reload re-evaluation of this file.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
const G = globalThis as unknown as { __cfDevInitialized?: boolean };
if (!G.__cfDevInitialized) {
	G.__cfDevInitialized = true;
	initOpenNextCloudflareForDev();
}
