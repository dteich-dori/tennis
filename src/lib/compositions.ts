// The 15 possible 4-player skill compositions (A/B/C counts summing to
// 4). Which ones the auto-assign is allowed to produce is now
// admin-tunable via the "allowed compositions" grid on Season Setup;
// the older hard-coded "AACC-only for any A+C mix" rule is retained as
// the DEFAULT, but any subset can be checked or unchecked.

export interface Composition {
  key: string;              // e.g. "AACC" — sorted-canonical string
  a: number;                // A count
  b: number;                // B count
  c: number;                // C count
  category: "tier-uniform" | "adjacent-tier" | "AACC" | "mixed-A+C";
  description: string;
  defaultAllowed: boolean;
}

function comp(a: number, b: number, c: number): { key: string; a: number; b: number; c: number } {
  return { key: "A".repeat(a) + "B".repeat(b) + "C".repeat(c), a, b, c };
}

export const COMPOSITIONS: Composition[] = [
  // Tier-uniform (same skill throughout)
  { ...comp(4, 0, 0), category: "tier-uniform", description: "All A players",       defaultAllowed: true },
  { ...comp(0, 4, 0), category: "tier-uniform", description: "All B players",       defaultAllowed: true },
  { ...comp(0, 0, 4), category: "tier-uniform", description: "All C players",       defaultAllowed: true },

  // Adjacent-tier (A+B or B+C — no A/C mix)
  { ...comp(3, 1, 0), category: "adjacent-tier", description: "3 A + 1 B",         defaultAllowed: true },
  { ...comp(2, 2, 0), category: "adjacent-tier", description: "2 A + 2 B",         defaultAllowed: true },
  { ...comp(1, 3, 0), category: "adjacent-tier", description: "1 A + 3 B",         defaultAllowed: true },
  { ...comp(0, 3, 1), category: "adjacent-tier", description: "3 B + 1 C",         defaultAllowed: true },
  { ...comp(0, 2, 2), category: "adjacent-tier", description: "2 B + 2 C",         defaultAllowed: true },
  { ...comp(0, 1, 3), category: "adjacent-tier", description: "1 B + 3 C",         defaultAllowed: true },

  // AACC — the current AACC-only exception (2 A + 2 C, no B)
  { ...comp(2, 0, 2), category: "AACC",           description: "2 A + 2 C (AACC — the classic exception)", defaultAllowed: true },

  // Mixed A+C — everything the current rule blocks. Unchecked by default.
  { ...comp(3, 0, 1), category: "mixed-A+C", description: "3 A + 1 C",             defaultAllowed: false },
  { ...comp(2, 1, 1), category: "mixed-A+C", description: "2 A + 1 B + 1 C",       defaultAllowed: false },
  { ...comp(1, 2, 1), category: "mixed-A+C", description: "1 A + 2 B + 1 C",       defaultAllowed: false },
  { ...comp(1, 1, 2), category: "mixed-A+C", description: "1 A + 1 B + 2 C",       defaultAllowed: false },
  { ...comp(1, 0, 3), category: "mixed-A+C", description: "1 A + 3 C",             defaultAllowed: false },
];

export const DEFAULT_ALLOWED_KEYS: string[] = COMPOSITIONS.filter((c) => c.defaultAllowed).map((c) => c.key);

/** Given a stored JSON string (or null), resolve to an allowed-set. */
export function parseAllowedCompositions(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set(DEFAULT_ALLOWED_KEYS);
  try {
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) {
      return new Set(arr);
    }
  } catch {
    /* fall through */
  }
  return new Set(DEFAULT_ALLOWED_KEYS);
}

/** True if the given (a, b, c) count matches at least one allowed key. */
export function isCompositionAllowed(a: number, b: number, c: number, allowed: Set<string>): boolean {
  const key = "A".repeat(a) + "B".repeat(b) + "C".repeat(c);
  return allowed.has(key);
}

/**
 * True if the partial (a, b, c) state can still reach at least one
 * allowed composition using `remaining` more slots. Optional
 * (availA, availB, availC) tighten this to a pool-feasibility check —
 * only accept trajectories whose additional-players requirement can be
 * satisfied by the currently-available pool.
 */
export function canReachAllowed(
  a: number, b: number, c: number,
  remaining: number,
  allowed: Set<string>,
  pool?: { availA: number; availB: number; availC: number },
): boolean {
  if (a + b + c + remaining !== 4) return false;
  for (let ap = a; ap <= a + remaining; ap++) {
    for (let bp = b; bp <= a + b + remaining - ap; bp++) {
      const cp = 4 - ap - bp;
      if (cp < c) continue;
      if (ap - a + bp - b + cp - c !== remaining) continue;
      const key = "A".repeat(ap) + "B".repeat(bp) + "C".repeat(cp);
      if (!allowed.has(key)) continue;
      if (pool) {
        if (ap - a > pool.availA) continue;
        if (bp - b > pool.availB) continue;
        if (cp - c > pool.availC) continue;
      }
      return true;
    }
  }
  return false;
}
