import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { seasons } from "./seasons";

export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  cellNumber: text("cell_number"),
  homeNumber: text("home_number"),
  email: text("email"),
  carrier: text("carrier"), // verizon, att, tmobile, sprint, etc. — for SMS gateway
  icsToken: text("ics_token"), // unguessable per-player token for webcal:// subscription
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  contractedFrequency: text("contracted_frequency").notNull().default("1"), // "1", "2", or "2+"
  skillLevel: text("skill_level").notNull().default("C"), // "A", "B", "C", "D"
  noConsecutiveDays: integer("no_consecutive_days", { mode: "boolean" }).notNull().default(false),
  noEarlyGames: integer("no_early_games", { mode: "boolean" }).notNull().default(false),
  // When true, auto-assign's Pass 2.5 front-loading (boosting a player's
  // weekly target ahead of an upcoming vacation to make up missed games)
  // is skipped for this player. They simply play their normal contract
  // and lose the games they miss on vacation, same as pre-v1.2xx behavior.
  noVacationMakeup: integer("no_vacation_makeup", { mode: "boolean" }).notNull().default(false),
  // Sole per-player control for C-adjacent games (v1.240 — the separate
  // cGamesOk opt-in checkbox was retired). null = Unlimited, 0 = never
  // (shielded), N = capped at N per season. No effect on C players
  // themselves — this only restricts a non-C player joining a C game.
  cGamesLimit: integer("c_games_limit"),
  soloGames: integer("solo_games"), // 1-36 target games per season, null = not in solo group
  groupPct: integer("group_pct").notNull().default(0), // 0, 25, 50, 100 — percentage of games filled from preferred group
  preassignedGamesWanted: integer("preassigned_games_wanted"), // null = not set; 1–50 = target pre-assigned games for subs
  // Accounts: when set, freezes the "extras" portion of the fee at this
  // count. null = dynamically computed from current scheduled games.
  // Applies to 2x+ players (extras above 2/wk) and subs (total games).
  lockedExtraGames: integer("locked_extra_games"),
  // When true, this player is skipped by auto-assign entirely. They remain
  // visible everywhere else (manual assignment, communications, reports).
  excludedFromAutoAssign: integer("excluded_from_auto_assign", { mode: "boolean" })
    .notNull()
    .default(false),
  // Group anchor: FK to a C-level player whose "group" this player has
  // opted into. Only A/B players with cGamesLimit !== 0 may have a
  // non-null anchor. NULL = not in any group. The anchor player has
  // groupPct applied to their own games; each member has their own
  // groupPct.
  groupAnchorId: integer("group_anchor_id"),
  // A2P 10DLC compliance: when the player replies STOP (or one of the
  // standard opt-out keywords) to any SMS, Twilio's webhook flips this
  // flag. The send code skips SMS to opted-out players (email still
  // works). Reply START/YES/UNSTOP flips it back off.
  // When true, this sub is available any date (subject to blocked days).
  // Used by the clear-swap adjustment pass as a general-pool fallback
  // (without 1:1 swap attribution) when no scheduled sub is found.
  alwaysAvailable: integer("always_available", { mode: "boolean" }).notNull().default(false),
  // Accounts: when true, this player is never billed — no season/contract
  // fee and no per-game fee. Their fee is forced to $0 everywhere the
  // accounting code runs (Accounts tab, PDFs, {balance} templates) and
  // they are left out of the Budget page's projected income. Intended for
  // comped subs; honored for every contract tier so the flag can't go
  // silently stale if a player's frequency changes.
  noCharge: integer("no_charge", { mode: "boolean" }).notNull().default(false),
  // Accounts: credit carried over from the previous year's distribution.
  // Subtracted from the player's Don's balance (fee − deposits − credit).
  priorYearCredit: real("prior_year_credit").notNull().default(0),
  // Accounts: deposits received against this player's SOLO fee. Kept
  // separate from the Don's deposit ledger (player_payments), which
  // covers the Don's contract only.
  soloDeposit: real("solo_deposit").notNull().default(0),
  smsOptOut: integer("sms_opt_out", { mode: "boolean" }).notNull().default(false),
  smsOptOutAt: text("sms_opt_out_at"),        // ISO timestamp of the last STOP
  smsOptOutReason: text("sms_opt_out_reason"), // exact incoming message text
});

export const playerBlockedDays = sqliteTable("player_blocked_days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0-6
});

export const playerVacations = sqliteTable("player_vacations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(), // Last day of vacation
});

// Sub-specific positive availability: date ranges when a sub (or 1+
// player acting as a sub) CAN be scheduled, as opposed to vacations
// which say when a player CANNOT. Only meaningful for sub-eligible
// players (contractedFrequency "0" or "1+") — when a sub has one or
// more ranges here, Pass 4 (subs) only considers them for games whose
// date falls within one of these ranges. A sub with no ranges here is
// unrestricted (available any date), preserving pre-existing behavior.
export const playerAvailableDates = sqliteTable("player_available_dates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(), // Last day of availability (inclusive)
});

export const playerDoNotPair = sqliteTable("player_do_not_pair", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  pairedPlayerId: integer("paired_player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
});

export const playerGroupMembers = sqliteTable("player_group_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id") // group head
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  memberId: integer("member_id") // preferred partner
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
});

