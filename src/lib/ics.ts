import { createEvents, type EventAttributes } from "ics";

// Types mirror the shapes used by the reports module so both can share data.
interface Assignment {
  id: number;
  gameId: number;
  playerId: number;
  slotPosition: number;
  isPrefill: boolean;
}

interface Game {
  id: number;
  gameNumber: number;
  seasonId: number;
  weekNumber: number;
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  startTime: string; // HH:MM
  courtNumber: number;
  group: string;
  status: string; // "normal" | "holiday" | "blanked"
  holidayName?: string | null;
  assignments: Assignment[];
}

interface Player {
  id: number;
  firstName: string;
  lastName: string;
}

const GAME_DURATION_MINUTES = 90;
const CALENDAR_NAME = "Brooklake Tennis";
const PRODUCT_ID = "-//TennisScheduler//Brooklake//EN";

/**
 * Parse "YYYY-MM-DD" into [year, month, day] (month is 1-indexed).
 * Uses string split to avoid JS Date timezone pitfalls.
 */
function parseDateParts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map((s) => parseInt(s, 10));
  return [y, m, d];
}

/**
 * Parse "HH:MM" into [hour, minute].
 */
function parseTimeParts(time: string): [number, number] {
  const [h, m] = time.split(":").map((s) => parseInt(s, 10));
  return [h, m];
}

/**
 * Format a player's display name (last name, or "Last, F." when there's a collision).
 */
function playerDisplayName(
  playerId: number,
  allPlayers: Map<number, Player>
): string {
  const p = allPlayers.get(playerId);
  if (!p) return "—";
  // Check for last-name collision
  let collision = false;
  for (const other of allPlayers.values()) {
    if (other.id !== p.id && other.lastName === p.lastName) {
      collision = true;
      break;
    }
  }
  if (collision) return `${p.firstName} ${p.lastName}`;
  return `${p.firstName} ${p.lastName}`;
}

/**
 * Generate a .ics calendar string for a single player containing all their
 * normal games for the given list. Caller is responsible for passing the
 * player's already-filtered-and-sorted games. Returns the .ics string, or an
 * empty string if the player has no normal games.
 */
export function generatePlayerIcs(
  player: Player,
  games: Game[],
  allPlayers: Map<number, Player>
): string {
  const normalGames = games.filter((g) => g.status === "normal");
  if (normalGames.length === 0) return "";

  const events: EventAttributes[] = normalGames.map((game) => {
    const [y, mo, d] = parseDateParts(game.date);
    const [h, mi] = parseTimeParts(game.startTime);

    // Determine ball responsibility from slotPosition
    const myAssignment = game.assignments.find((a) => a.playerId === player.id);
    const isBallProvider = myAssignment?.slotPosition === 1;

    // Build list of co-players sorted by slotPosition, excluding self
    const coPlayers = game.assignments
      .filter((a) => a.playerId !== player.id)
      .sort((a, b) => a.slotPosition - b.slotPosition)
      .map((a) => playerDisplayName(a.playerId, allPlayers));

    const descriptionLines: string[] = [];
    descriptionLines.push(`Week ${game.weekNumber} — Game ${game.gameNumber}`);
    descriptionLines.push(`Court ${game.courtNumber}`);
    if (coPlayers.length > 0) {
      descriptionLines.push(`With: ${coPlayers.join(", ")}`);
    }
    if (isBallProvider) {
      descriptionLines.push("You are bringing the balls for this game.");
    }

    return {
      uid: `game-${game.id}@tennis-scheduler.local`,
      start: [y, mo, d, h, mi],
      startInputType: "local",
      duration: { hours: Math.floor(GAME_DURATION_MINUTES / 60), minutes: GAME_DURATION_MINUTES % 60 },
      title: isBallProvider ? "Brooklake*" : "Brooklake",
      location: `Brooklake — Court ${game.courtNumber}`,
      description: descriptionLines.join("\n"),
      productId: PRODUCT_ID,
      calName: CALENDAR_NAME,
    };
  });

  const { error, value } = createEvents(events);
  if (error) {
    throw new Error(`Failed to generate ICS for ${player.firstName} ${player.lastName}: ${error.message || String(error)}`);
  }
  if (!value) return "";

  // Safety net: ensure X-WR-CALNAME is present (some versions of `ics` emit it, some don't).
  let ics = value;
  if (!/X-WR-CALNAME/i.test(ics)) {
    ics = ics.replace(/PRODID:[^\r\n]+/, (match) => `${match}\r\nX-WR-CALNAME:${CALENDAR_NAME}`);
  }

  return ics;
}
