import { getDb, type Database } from "./index";

/**
 * Unified database access for both dev and production.
 *
 * All DB access goes through the Cloudflare D1 binding (via Miniflare proxy
 * in dev, real D1 in production). This eliminates the dual-writer problem
 * where better-sqlite3 and Miniflare's workerd both held open connections
 * to the same SQLite file, causing crashes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const G = globalThis as any;
const DB_KEY = "__tennis_d1_db";

export async function db(): Promise<Database> {
  // Return cached Drizzle instance if available
  if (G[DB_KEY]) {
    return G[DB_KEY];
  }

  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const database = getDb(env.DB);

  // Cache in dev to avoid repeated proxy lookups
  if (process.env.NODE_ENV === "development") {
    G[DB_KEY] = database;
  }

  return database;
}
