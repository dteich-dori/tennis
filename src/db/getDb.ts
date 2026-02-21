import { createDatabase, type Database } from "./index";

let cached: Database | null = null;

export async function db(): Promise<Database> {
  if (cached) return cached;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables"
    );
  }

  cached = createDatabase(url, authToken);
  return cached;
}
