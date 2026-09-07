import { pgTable, text, timestamp, boolean, uuid, jsonb, integer } from 'drizzle-orm/pg-core'
import type { PlannerSettings } from './time-blocks'
import { relations } from 'drizzle-orm'
import { userRoleEnum, oauthProviderEnum } from './enums'
import { workspaceMembers } from './workspaces'
import { sessions } from './auth'

export const users = pgTable('users', {
  id:            uuid('id').primaryKey().defaultRandom(),
  email:         text('email').notNull().unique(),
  displayName:   text('display_name').notNull(),
  avatarUrl:     text('avatar_url'),
  bio:           text('bio'),
  timezone:      text('timezone').notNull().default('UTC'),
  /**
   * G06-6 [07:03] — ClickUp's "Notify me of Timezone changes", checked by
   * default. When the browser reports a different zone from this one, say so
   * and offer to update, rather than letting somebody who has moved keep a
   * stale zone silently skewing every due date they see.
   */
  timezoneChangeNotice: boolean('timezone_change_notice').notNull().default(true),
  role:          userRoleEnum('role').notNull().default('member'),
  passwordHash:  text('password_hash'),
  emailVerified: boolean('email_verified').notNull().default(false),
  isActive:      boolean('is_active').notNull().default(true),
  // Failed-login lockout (driven by per-workspace security policy). Counter
  // resets to 0 on any successful login; lockedUntil is a short auto-releasing
  // window, never a permanent ban.
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil:         timestamp('locked_until', { withTimezone: true }),
  // Notification settings. The column default seeds channels + events; the
  // notifications service merges additional keys on read so they can evolve
  // without a data migration: `digest` (email digest, §10) and
  // `reminderLeadDays` (§10.4 — int[] of lead days for due-date reminders,
  // default [1, 2]; 0063 backfills existing rows explicitly).
  notificationPreferences: jsonb('notification_preferences').notNull().default({
    channels: {
      webEnabled: true,
      mobileEnabled: false,
      dndOn: false,
      dndStart: '21:00',
      dndEnd: '08:00',
      muteSounds: false,
    },
    events: {
      mention: { inApp: true, web: true, mobile: false, email: true },
      assigned: { inApp: true, web: true, mobile: false, email: true },
      comment: { inApp: true, web: true, mobile: false, email: true },
      due: { inApp: true, web: true, mobile: false, email: true },
      status: { inApp: true, web: true, mobile: false, email: true },
      doc: { inApp: true, web: true, mobile: false, email: true },
      chat: { inApp: true, web: true, mobile: false, email: true },
      activity: { inApp: true, web: true, mobile: false, email: true },
    },
  }),
  // Presence heartbeat (Plan §6.2): refreshed while a realtime socket is open;
  // "online/away/offline" is derived from how recently this was touched.
  lastSeenAt:    timestamp('last_seen_at', { withTimezone: true }),
  // §A4.8 manual presence override. NULL = derive from lastSeenAt; a value is
  // the user's stated intent ('online' | 'away' | 'busy' | 'offline') and wins
  // over the derived status everywhere presence is read.
  presenceStatus: text('presence_status').$type<'online' | 'away' | 'busy' | 'offline'>(),
  /**
   * §G06 [06:42] — what you are actually doing, in your own words.
   *
   * "SET STATUS ka matlab yeh hota hai ke main BREAK pe jaa rahi hoon… mere
   * team member ko nahi pata ke main break pe jaa rahi hoon; agar unhon ne
   * group mein message nahi dekha, to main yahan se apna status set kar sakti
   * hoon ke main is time kya kar rahi hoon."
   *
   * `presenceStatus` above is the availability half and cannot carry this:
   * "away" does not say it is a thirty-minute break, and nothing about it
   * expires, so a stale "Busy" outlives the reason for it by days. These three
   * columns are the other half — an emoji, a sentence, and a moment it stops
   * being true.
   */
  statusEmoji:   text('status_emoji'),
  statusText:    text('status_text'),
  /**
   * When the status stops being true. Null means "until I clear it".
   *
   * Expiry is enforced on READ rather than by a sweeper: a job that clears
   * statuses is a job that can be down, and a status that outlives its reason
   * is exactly the failure this column exists to prevent. Past this moment
   * every reader simply ignores the row.
   */
  statusExpiresAt: timestamp('status_expires_at', { withTimezone: true }),
  /**
   * §G06 [06:53] — muted until a moment, not muted forever.
   *
   * The row in the frames carries a "›" — mute for a length of time. Ours was
   * a switch that stayed flipped until somebody remembered to flip it back, so
   * muting for one meeting muted you for days. Null means no timed mute; the
   * scheduled quiet hours in `notificationPreferences` are a separate thing and
   * still apply.
   */
  dndUntil:      timestamp('dnd_until', { withTimezone: true }),
  /**
   * §G06 [07:03] — high-contrast text and borders.
   *
   * Nothing existed at any layer. Kept beside `theme` because it is the same
   * kind of choice — how the app should look for this person, wherever they
   * sign in — and null means never chosen rather than "off", so the default can
   * change without overwriting anybody's answer.
   */
  highContrast:  boolean('high_contrast'),
  /*
   * §G06 [07:11] — the accent this person picked, from the named palette.
   * NULL means "no personal choice" and falls back to the workspace's accent,
   * so an account that never opens the palette is unaffected.
   */
  accentColor:   text('accent_color'),
  // UI language (Plan §13 i18n). BCP-47 short code; the web app localizes +
  // sets text direction (RTL for ar/he/fa) from this.
  locale:        text('locale').notNull().default('en'),
  // UI theme preference (Plan §13.1 dark mode). 'system' | 'light' | 'dark';
  // 'system' follows the OS. Persisted so the choice follows the user across
  // devices — hydrated from GET /users/me and synced by the topbar toggle +
  // profile appearance selector.
  theme:         text('theme').notNull().default('system'),
  // Date / time / week-start display preferences (Plan §1.2). 'system' honours
  // the browser locale; explicit values override how dates and times render
  // across the app. dateFormat: system|MM/DD/YYYY|DD/MM/YYYY|YYYY-MM-DD|DD MMM YYYY;
  // timeFormat: system|12h|24h; weekStart: sunday|monday|saturday.
  dateFormat:    text('date_format').notNull().default('system'),
  timeFormat:    text('time_format').notNull().default('system'),
  weekStart:     text('week_start').notNull().default('sunday'),
  // §1.5 — which optional top-bar controls this member has put away.
  //
  // > "hum notification yahan le ke jaa rahe hain, to humein yahan bhi rakhne
  // >  ki zaroorat nahi hai … ya phir humein rakhne ki zaroorat hai to yeh
  // >  option jo hai woh humare members ke paas hona chahiye … Lekin humare
  // >  paas NAV BAR ko set down karne ka option nahi hai."
  //
  // Stored as what is *hidden* rather than what is shown, so a control added
  // later appears for everyone by default instead of silently staying off for
  // every existing member. The bell ships hidden — that is her "[Default par]"
  // — and a member can put it back.
  topbarHidden:  jsonb('topbar_hidden').$type<string[]>().notNull().default(['notifications']),
  /**
   * §6 [07:51] — "main yahan koi bhi tool PIN kar sakti hoon."
   *
   * The column above is opt-*out*: absence means shown. That was right while
   * the bar held five controls we had chosen, and wrong the moment the
   * catalogue grew to the tools she actually pins — every new one would appear
   * unbidden in everyone's bar, which is the opposite of the ask.
   *
   * So pinning is opt-*in*, and NULL is load-bearing: it means "has never
   * chosen", which is distinct from an empty array meaning "chose to pin
   * nothing". The first is migrated from topbarHidden so nobody's bar changes
   * under them; the second is a decision to respect.
   */
  topbarPinned:  jsonb('topbar_pinned').$type<string[] | null>(),
  /**
   * §1.3 — whether the workspace sidebar is collapsed to its icon rail.
   *
   * Was localStorage only, so "mujhe nahi chahiye to space le" [10:24] held on
   * one browser and was forgotten on the next. §1.5 already settled where this
   * kind of choice belongs — "yeh option jo hai woh humare members ke paas hona
   * chahiye" — and this is the same kind of choice, stored the other way.
   *
   * Nullable: null means never chosen, so an account that has not touched the
   * arrow keeps the expanded default rather than inheriting somebody's false.
   * The browser copy stays as well, because index.html reads it to draw the
   * rail at the right width before React is running.
   */
  sidebarCollapsed: boolean('sidebar_collapsed'),
  /**
   * §1.3 [10:13] — the SECOND-level panels, collapsed per surface.
   *
   * "yeh DOUBLE NAVIGATION rakhi hui hai… kyunke yeh SPACE leta hai." The
   * outer sidebar collapsing was only half of it: on /chat we stack a 288px
   * sidebar against a 272px channel list, and on /docs against a 240px tree.
   * Collapsing the outer one leaves the screen she was actually complaining
   * about still carrying two columns of chrome.
   *
   * One jsonb rather than a boolean column per panel. These are the same kind
   * of choice repeated per surface, and the list of surfaces grows — a column
   * and a migration for each is how a preferences table becomes forty columns
   * nobody can name. Keyed by surface (`chat`, `docs`) because collapsing the
   * channel list is not a statement about the docs tree.
   *
   * Nullable, like sidebarCollapsed and for the same reason: null means never
   * chosen, so an account that has not touched an arrow keeps the expanded
   * default rather than inheriting somebody else's false.
   */
  panelsCollapsed: jsonb('panels_collapsed').$type<Record<string, boolean> | null>(),
  /**
   * §V2-02 — the Planner's own preferences, frame `14:10`.
   *
   * Null means never opened the settings, so every default is the app's.
   * Deliberately does NOT hold week start, timezone or time format: those are
   * `weekStart`, `timezone` and `timeFormat` a few lines up, and a second copy
   * that could disagree with them is a bug with a settings page for creating
   * it. See `PlannerSettings` in `schema/time-blocks.ts` for the shape.
   */
  plannerSettings: jsonb('planner_settings').$type<PlannerSettings | null>(),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const oauthAccounts = pgTable('oauth_accounts', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider:     oauthProviderEnum('provider').notNull(),
  providerId:   text('provider_id').notNull(),
  accessToken:  text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt:    timestamp('expires_at', { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const usersRelations = relations(users, ({ many }) => ({
  sessions:         many(sessions),
  workspaceMembers: many(workspaceMembers),
  oauthAccounts:    many(oauthAccounts),
}))

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
}))
