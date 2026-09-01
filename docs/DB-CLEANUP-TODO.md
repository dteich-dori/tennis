# Duplicate rows in `game_assignments` — cleanup still owed

**Found:** 31 August 2026, tracing a report complaint.
**Planned:** winter 2026–27, with Rudor.
**Status:** NOT fixed. The Weekly Game Counts report works around it; the data is untouched.

## The symptom

The Weekly Game Counts report showed **Rick Simon with 5 games in week 22** of the
2026–27 season. The schedule screen for that week shows him in 2 (games #367 and
#370); he is also present in #371 and #374 but not as the first row for those
slots, so the grid never displays him there.

## What is actually wrong

`game_assignments` holds more than one row for some `(game_id, slot_position)`
pairs. A game has four slots; several games carry eight rows.

Week 22 (2026-09-14 season), assignment rows per game:

| Games | Rows | Distinct players |
|---|---|---|
| #358–360 (Mon), #361 & #365 (solo) | 4 | 4 |
| #366 | 5 | 4 |
| the other 11 Don's games | **8** | 4–7 |

Game #371 as stored:

```
slot 1  Don Miller          slot 1  Stephen Schwartz
slot 2  Mike Dundas         slot 2  Rick Simon
slot 3  Jerry Carlin        slot 3  Jerry Carlin
slot 4  Claire Claire       slot 4  Claire Claire
```

The left column is what the schedule shows. The right column is invisible on screen.

Sometimes the extra row repeats the same player, sometimes it names a different
one (#374 has 7 distinct players across 4 slots). That pattern — two overlapping
sets, agreeing on some slots and not others — looks like two assignment runs
landing on the same games without the first being cleared. **Not confirmed.**
Rudor asked that auto-assign not be touched until the data is understood.

## Why nothing on screen ever showed it

`src/app/schedule/page.tsx` renders each slot with:

```js
const assignment = game.assignments.find((a) => a.slotPosition === slot);
```

`.find()` returns the first match. Four slots, four players displayed, extras
unreachable. Any view built on slots hides this; any code that counts rows
trips over it.

## What was done instead (31 Aug 2026)

`src/lib/reports/weeklyGameCountsPdf.ts` now counts one row per slot — the same
rule the grid uses — so the report agrees with the screen. Two edits:

- `GameAssignmentLite` gained `slotPosition`
- the counting loop skips slots already seen (`slotSeen`)
- `src/app/reports/page.tsx` widened its fetch type to carry `slotPosition`

Verified against week 22 via the public route: 105 counted rows drop to 60, which
is exactly 4 per Don's game across all 15 of them. Rick Simon goes 5 -> 2. Every
player in the week changes; 28 of them were being over-counted.

This is a mask, not a repair.

## Extent (measured 31 Aug 2026, all 37 weeks via the public route)

**Only week 22 is affected.** Every other week is clean.

| | |
|---|---|
| Don's games in the season | 543 |
| Games not holding exactly 4 rows | 12 (all in week 22) |
| Assignment rows, raw | 2,217 |
| Assignment rows, after dedupe | 2,172 |
| Phantom rows | 45 |
| Players over-counted | 28, by 1–3 games each |

Worst: Stephen Schwartz, Rick Simon, Susan Fels and Rich Grunebaum, 3 games each.

Money only moves for **1x+**, **2x+** (games beyond their base of freq x
weeksPerSeason) and **subs** (every game billed). Flat 1x and 2x players show a
wrong game count but the same fee. Players with `lockedExtraGames` set are
immune — the override replaces the computed count.

## Readers fixed (31 Aug 2026)

All now route through `firstPerSlot` / `countPerPlayer` in
`src/lib/dedupeAssignments.ts`:

| File | Was | Why it mattered |
|---|---|---|
| `lib/loadAccountSummaries.ts` | counted raw rows | bill emails / Communications |
| `app/api/budget-computed/route.ts` | three `count(*)` queries | budget + bookkeeping PDF |
| `app/budget/AccountsTab.tsx` | counted raw rows | Accounts screen + accounts-summary PDF |
| `app/api/games/extra/route.ts` | counted raw rows | decides which games are billable extras |
| `lib/reports/weeklyGameCountsPdf.ts` | counted raw rows | the report that surfaced this |
| `app/api/ics/[token]/route.ts` | counted raw rows | subscribers' personal calendars |

### The ICS feed was the worst of them

It is emailed to every player and lands in Apple/Google Calendar. Three separate
failures, all cured by deduping once in the route before `enrichedGames`:

1. **11 phantom calendar events** — the feed selects a player's games with
   `assignments.some(a => a.playerId === player.id)`, which matches
   second-row rows too. Nine people would have received an appointment for a
   game their schedule does not show them in, and could have turned up:

   | Player | Game |
   |---|---|
   | Rick Simon | #371, #374 |
   | Stephen Schwartz | #362, #371 |
   | Rich Grunebaum | #370, #374 |
   | Don Miller | #369 |
   | Mike Dundas | #369 |
   | Richard Brodow | #370 |
   | Barbara Quackenbos | #373 |
   | Bill Kennard | #374 |

   All in week 22, all 2027-02-09 to 2027-02-12.

2. **Two games telling two different people to bring the balls.** Ball duty is
   slot 1, found with `.find()`. Game #371 would have told both Don Miller and
   Stephen Schwartz; #374 both Eliot Ganek and Bill Kennard. (Nine further
   games have the same person twice at slot 1, which is harmless.)

3. **Twelve games with a garbled co-player line** — "With:" built from every
   remaining row, so it read e.g. "Wise, Wise, Peskin, Peskin, Brodow, ..."
   with 7 names instead of 3.

`lib/ics.ts` now documents the precondition so nobody feeds it raw rows again.

The `count(*)` queries could NOT simply become `count(DISTINCT game_id,
slot_position)`. A player who is the *second* row at a slot is not shown there
and must not be counted there — distinct-pair counting would still credit them.
Hence the lowest-id rule.

## Still to do

1. **Find the true extent.** The 8-row pattern was confirmed only for week 22.
   Count rows per `(game_id, slot_position)` across every season.
2. **Decide which row survives.** Keeping the lowest `id` per `(game_id,
   slot_position)` reproduces what the schedule shows today, so nobody's
   schedule changes. Confirm that against a few weeks Rudor knows by eye
   before deleting anything.
3. **Delete the losers.** Back up `game_assignments` first. This is Rudor's to
   run against the live Turso database.
4. **Stop it recurring.** A unique index on `(game_id, slot_position)` would
   make a second write fail loudly instead of stacking silently. Confirm no
   legitimate case needs two rows for one slot first.
5. **Readers still unfixed.** Billing is done (table above). These still count
   raw rows and should be moved onto `firstPerSlot`:
   `api/games/stats`, `api/games/compliance`, `api/games/composition`,
   `api/games/composition-by-player`, `api/games/pairings`,
   `api/reports/c-slot-diagnosis`, `lib/balancePairings.ts`,
   `lib/reports/gamesByPlayerPdf.ts`, `lib/reports/exceptionsPdf.ts`.
   None of these move money; they misreport.

   **`api/games/counts` is deliberately NOT fixed.** It supplies the WTD / YTD /
   STD numbers that auto-assign reads to decide who is owed a game. Correcting
   it would change assignment behaviour, and Rudor asked that auto-assign be
   left alone until the data is understood. Fix it in the same sitting as the
   cleanup, not before.
6. **Remove the mask** once the table is clean — the `slotSeen` guard becomes a
   no-op.

## Reading the data without database access

Both shells available to Claude are blocked from Turso. The public route works
and needs no auth:

```
https://scheduler.teich.net/api/public/schedule?week=22
```

It returns raw assignment rows per game, so duplicates show up directly in the
`players` array. `?from=YYYY-MM-DD` selects by date instead.

## Self-check added to the Weekly Game Counts report

Rudor's suggestion, 31 Aug 2026: a week's column can never legitimately total
more than 4 x the number of Don's normal games that week (60 in a typical
15-game week). Week 22 was showing 105. The report now computes that capacity
per week and, if a total exceeds it, prints a red DATA ERROR banner naming the
weeks and colours the offending totals red — so the report says it cannot be
trusted rather than printing a plausible wrong number.

With the slot dedupe in place this should never fire. It is a backstop against
the next way the data goes wrong. The softer signal fires today: the report
counts the duplicate rows it ignored and prints "N duplicate slot entries
ignored in week 22", so the mask is never silent.

Worth copying this pattern into the other counting reports.

## Separately: genuinely incomplete games (NOT duplicates)

The season-wide sweep also turned up three games short of four players. These
are unfilled slots, not duplicate rows, and nothing here fixes them:

- week 2, game #25 — 3 players
- week 37, games #616 and #620 — 0 players

## Loose ends

Two scratch files of mine are sitting in the project root and should be deleted:
`q-tmp.mjs` (dead) and `simon-week22.mjs` (a read-only query script — it still
works if run on the Mac, where the network isn't blocked).
