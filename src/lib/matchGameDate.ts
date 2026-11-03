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
  //  Mac/iPhone text replacement turns "2/3" into the single character ⅔
  //  (and "3/4" into ¾, and so on). NFKC unfolds those back to "2⁄3", with
  //  U+2044, the fraction slash, as the separator.
  const clean = text.normalize("NFKC").replace(/\u2044/g, "/").trim();
  const m = clean.match(/^(\d{1,2})\s*[/.\-\s]\s*(\d{1,2})(?:\s*[/.\-\s]\s*(\d{2}|\d{4}))?$/);
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
