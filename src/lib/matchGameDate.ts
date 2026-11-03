/**
 * Find the game a person means by typing a month and day ("3/10", "3-10",
 * or with a year: "3/10/27", "3/10/2027"). Season dates only ever fall on
 * one year for a given month and day, so the year is taken from the game
 * itself rather than typed.
 */
export function matchGameDate<T extends { date: string }>(
  text: string,
  games: T[]
): { game: T | null; error: string } {
  const m = text.trim().match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2}|\d{4}))?$/);
  if (!m) return { game: null, error: "Enter the date as month/day, e.g. 3/10." };
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  let year: number | null = null;
  if (m[3]) year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
  const found = games.filter((g) => {
    const [y, mo, d] = g.date.split("-").map(Number);
    return mo === month && d === day && (year === null || y === year);
  });
  if (found.length === 0) return { game: null, error: `No game on ${month}/${day}.` };
  return { game: found[0], error: "" };
}
