import { pgTable, text, timestamp, uuid, jsonb, integer, index, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * WHAT BRAIN MAKES, as ClickUp's Artifacts (`ledger-rows/row-853`, frame `16:50`):
 * asked for an overview, Brain answers with prose and an embedded deck — "I made
 * you a quick overview. 4 slides." — that opens as a slide deck. ClickUp's are
 * private to whoever asked until they are published to a link, changed by asking
 * again (the whole artifact, not one slide), and keep their earlier versions to
 * restore.
 *
 * A deck is the one kind made here. Each version is kept whole in
 * `ai_artifact_versions`; `current_version` names the one shown, and restoring
 * an old one writes it again as the newest, so history is only ever added to.
 */
export type DeckSlide = { title: string; bullets: string[]; notes?: string }

export const aiArtifacts = pgTable(
  'ai_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    createdById: uuid('created_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('deck'),
    title: text('title').notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    /** Set while it is published: the link anybody may open it by, read-only. */
    publishToken: text('publish_token'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('ai_artifacts_owner_idx').on(t.createdById, t.workspaceId, t.updatedAt),
    tokenUnique: uniqueIndex('ai_artifacts_publish_token_unique').on(t.publishToken),
    kindCheck: check('ai_artifacts_kind_check', sql`${t.kind} IN ('deck')`),
  }),
)

export const aiArtifactVersions = pgTable(
  'ai_artifact_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artifactId: uuid('artifact_id').notNull().references(() => aiArtifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** Each version keeps its own title: asking again may retitle a deck, and restoring brings the old one back. */
    title: text('title').notNull(),
    slides: jsonb('slides').$type<DeckSlide[]>().notNull(),
    /** What it was made or changed from: the question, or what was asked of the last version. */
    prompt: text('prompt').notNull().default(''),
    /** The version this one was restored from, when it was. */
    restoredFrom: integer('restored_from'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUnique: uniqueIndex('ai_artifact_versions_unique').on(t.artifactId, t.version),
  }),
)

export const aiArtifactsRelations = relations(aiArtifacts, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [aiArtifacts.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [aiArtifacts.createdById], references: [users.id] }),
  versions: many(aiArtifactVersions),
}))

export const aiArtifactVersionsRelations = relations(aiArtifactVersions, ({ one }) => ({
  artifact: one(aiArtifacts, { fields: [aiArtifactVersions.artifactId], references: [aiArtifacts.id] }),
}))
