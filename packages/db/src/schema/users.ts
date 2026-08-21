import { pgTable, text, timestamp, boolean, uuid, jsonb, integer } from 'drizzle-orm/pg-core'
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
