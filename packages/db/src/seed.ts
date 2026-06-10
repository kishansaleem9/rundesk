import { hashSync } from 'bcryptjs'
import { eq, and } from 'drizzle-orm'
import { getDb } from './client'
import {
  users,
  organizations,
  workspaces,
  workspaceMembers,
  spaces,
  projects,
  lists,
  tasks,
  taskAssignees,
  featureFlags,
  labels,
  taskLabelAssignments,
  taskChecklists,
  taskChecklistItems,
  taskViews,
  docs,
  listStatuses,
} from './schema'
import { DEFAULT_ENABLED_FLAGS } from '@rundesk/feature-flags'

const ADMIN_EMAIL = 'admin@rundesk.internal'
const ADMIN_PASSWORD = 'Admin@123!'
const ORG_ADMIN_EMAIL = 'org-admin@rundesk.internal'
const ORG_ADMIN_PASSWORD = 'OrgAdmin@123!'
const ORG_SLUG = 'rundesk-hq'
const WORKSPACE_SLUG = 'main'

async function upsertOrganization(db: ReturnType<typeof getDb>) {
  const [existing] = await db.select().from(organizations).where(eq(organizations.slug, ORG_SLUG))
  if (existing) return existing
  const [created] = await db
    .insert(organizations)
    .values({ name: 'Rundesk HQ', slug: ORG_SLUG })
    .returning()
  return created
}

async function upsertAdmin(db: ReturnType<typeof getDb>) {
  const [existing] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL))
  if (existing) return existing
  const [created] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      displayName: 'Super Admin',
      passwordHash: hashSync(ADMIN_PASSWORD, 12),
      role: 'super_admin',
      emailVerified: true,
    })
    .returning()
  return created
}

async function upsertOrganizationAdmin(db: ReturnType<typeof getDb>) {
  const [existing] = await db.select().from(users).where(eq(users.email, ORG_ADMIN_EMAIL))
  if (existing) return existing
  const [created] = await db
    .insert(users)
    .values({
      email: ORG_ADMIN_EMAIL,
      displayName: 'Organization Admin',
      passwordHash: hashSync(ORG_ADMIN_PASSWORD, 12),
      role: 'workspace_admin',
      emailVerified: true,
    })
    .returning()
  return created
}

async function upsertWorkspace(db: ReturnType<typeof getDb>, orgId: string) {
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.slug, WORKSPACE_SLUG), eq(workspaces.organizationId, orgId)))
  if (existing) return existing
  const [created] = await db
    .insert(workspaces)
    .values({ organizationId: orgId, name: 'Main Workspace', slug: WORKSPACE_SLUG })
    .returning()
  return created
}

async function ensureMembership(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  userId: string,
  role: 'workspace_admin',
) {
  const [existing] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
  if (existing) return existing
  const [created] = await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId, role })
    .returning()
  return created
}

async function upsertGlobalFlags(db: ReturnType<typeof getDb>, updatedBy: string) {
  for (const flagKey of DEFAULT_ENABLED_FLAGS) {
    await db
      .insert(featureFlags)
      .values({
        flagKey,
        scope: 'global',
        scopeId: null,
        workspaceId: null,
        enabled: true,
        updatedBy,
      })
      .onConflictDoNothing()
  }
}

async function upsertFirstOrCreate<T extends { id: string }>(
  rows: T[],
  create: () => Promise<T>,
): Promise<T> {
  if (rows.length > 0) return rows[0]
  return create()
}

async function seedDemoContent(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  adminId: string,
) {
  const existingSpaces = await db
    .select()
    .from(spaces)
    .where(eq(spaces.workspaceId, workspaceId))

  const space = await upsertFirstOrCreate(existingSpaces, async () => {
    const [created] = await db
      .insert(spaces)
      .values({
        workspaceId,
        name: 'General',
        description: 'Default space seeded by rundesk',
        color: '#354fb0',
        icon: '🏠',
      })
      .returning()
    return created
  })

  const existingProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.spaceId, space.id))

  const project = await upsertFirstOrCreate(existingProjects, async () => {
    const [created] = await db
      .insert(projects)
      .values({
        spaceId: space.id,
        name: 'Onboarding',
        description: 'Your first project',
        color: '#6f96d1',
        icon: '🚀',
      })
      .returning()
    return created
  })

  const existingLists = await db
    .select()
    .from(lists)
    .where(eq(lists.projectId, project.id))

  const list = await upsertFirstOrCreate(existingLists, async () => {
    const [created] = await db
      .insert(lists)
      .values({
        projectId: project.id,
        name: 'To do',
        description: 'Tasks seeded on first boot',
        position: 0,
      })
      .returning()
    return created
  })

  // Per-list statuses: the API seeds these in lists.service on create, but the
  // seed inserts the demo list directly, so mirror the same defaults here.
  // Without them the Board view has no columns to render. Idempotent.
  await db
    .insert(listStatuses)
    .values(
      [
        { key: 'backlog',     name: 'Backlog',     color: '#94a3b8', category: 'open' as const,        position: 0 },
        { key: 'todo',        name: 'To do',       color: '#64748b', category: 'open' as const,        position: 1 },
        { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress' as const, position: 2 },
        { key: 'in_review',   name: 'In review',   color: '#a855f7', category: 'in_progress' as const, position: 3 },
        { key: 'done',        name: 'Done',        color: '#10b981', category: 'closed' as const,      position: 4 },
        { key: 'cancelled',   name: 'Cancelled',   color: '#f43f5e', category: 'closed' as const,      position: 5 },
      ].map((s) => ({ listId: list.id, ...s })),
    )
    .onConflictDoNothing()

  // Workspace labels
  const labelSeeds = [
    { name: 'bug',       color: '#ef4444' },
    { name: 'feature',   color: '#3b82f6' },
    { name: 'chore',     color: '#a3a3a3' },
    { name: 'blocked',   color: '#f97316' },
    { name: 'good-first-issue', color: '#22c55e' },
  ]
  for (const l of labelSeeds) {
    await db.insert(labels).values({ workspaceId, ...l }).onConflictDoNothing()
  }

  // Default saved views on the list
  const existingViews = await db.select().from(taskViews).where(eq(taskViews.listId, list.id))
  if (existingViews.length === 0) {
    await db.insert(taskViews).values([
      { listId: list.id, name: 'List',     type: 'list',     isDefault: true,  position: 0, config: {} },
      { listId: list.id, name: 'Board',    type: 'board',    isDefault: false, position: 1, config: { groupBy: 'status' } },
      { listId: list.id, name: 'Calendar', type: 'calendar', isDefault: false, position: 2, config: {} },
      { listId: list.id, name: 'Table',    type: 'table',    isDefault: false, position: 3, config: {} },
    ])
  }

  const existingTasks = await db.select().from(tasks).where(eq(tasks.listId, list.id))
  if (existingTasks.length === 0) {
    const [welcome, invite, palette, realtime, docsTask] = await db.insert(tasks).values([
      {
        listId: list.id,
        title: 'Welcome to Rundesk 👋',
        description: 'Click this task to open the detail panel. Drag tasks between statuses on the Board view.',
        priority: 'normal',
        status: 'todo',
        position: 0,
        createdById: adminId,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
      {
        listId: list.id,
        title: 'Invite your team',
        description: 'Add members to your workspace from the settings screen.',
        priority: 'high',
        status: 'todo',
        position: 1,
        createdById: adminId,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      {
        listId: list.id,
        title: 'Try the ⌘K command palette',
        description: 'Quick-create tasks and jump between views without leaving the keyboard.',
        priority: 'low',
        status: 'in_progress',
        position: 2,
        createdById: adminId,
      },
      {
        listId: list.id,
        title: 'Collaborate in real time',
        description: 'Open this task in two browser windows to see live updates propagate.',
        priority: 'normal',
        status: 'todo',
        position: 3,
        createdById: adminId,
      },
      {
        listId: list.id,
        title: 'Write your first Doc',
        description: 'Docs live in the sidebar. Tiptap-powered rich text with slash commands.',
        priority: 'low',
        status: 'backlog',
        position: 4,
        createdById: adminId,
      },
    ]).returning()

    // Assign the admin to the welcome task and add a label
    await db.insert(taskAssignees).values({ taskId: welcome.id, userId: adminId })
    const [bugLabel] = await db.select().from(labels).where(and(eq(labels.workspaceId, workspaceId), eq(labels.name, 'feature')))
    if (bugLabel) {
      await db.insert(taskLabelAssignments).values({ taskId: welcome.id, labelId: bugLabel.id }).onConflictDoNothing()
    }

    // Seed a checklist on the welcome task
    const [checklist] = await db.insert(taskChecklists).values({
      taskId: welcome.id,
      title: 'Quickstart',
      position: 0,
    }).returning()

    await db.insert(taskChecklistItems).values([
      { checklistId: checklist.id, content: 'Sign in to Rundesk',          isDone: true,  position: 0, completedAt: new Date() },
      { checklistId: checklist.id, content: 'Create your first task',      isDone: false, position: 1 },
      { checklistId: checklist.id, content: 'Try switching to Board view', isDone: false, position: 2 },
      { checklistId: checklist.id, content: 'Open a Doc from the sidebar', isDone: false, position: 3 },
    ])

    // keep reference so other bits (if any) don't break
    void invite; void palette; void realtime; void docsTask
  }

  // Seed a default doc at workspace scope
  const existingDocs = await db.select().from(docs).where(eq(docs.workspaceId, workspaceId))
  if (existingDocs.length === 0) {
    const welcomeContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome to Rundesk Docs' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'This is your first doc. Everything here is rich-text, including ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'bold' }, { type: 'text', text: ', ' }, { type: 'text', marks: [{ type: 'italic' }], text: 'italic' }, { type: 'text', text: ', and headings.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Things to try' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create a new task' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Switch to Board view and drag a task' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open two tabs to see realtime updates' }] }] },
        ] },
      ],
    }
    await db.insert(docs).values({
      workspaceId,
      spaceId: space.id,
      createdById: adminId,
      title: 'Welcome & Quickstart',
      icon: '📘',
      content: welcomeContent,
      plaintext: 'Welcome to Rundesk Docs. This is your first doc. Everything here is rich-text.',
      position: 0,
    })
  }
}

async function seed() {
  const db = getDb()
  console.log('🌱  Seeding database (idempotent)')

  const org = await upsertOrganization(db)
  console.log(`  org         ${org.slug}    (${org.id})`)

  const admin = await upsertAdmin(db)
  console.log(`  admin       ${admin.email}`)

  const orgAdmin = await upsertOrganizationAdmin(db)
  console.log(`  org admin   ${orgAdmin.email}`)

  const workspace = await upsertWorkspace(db, org.id)
  console.log(`  workspace   ${workspace.slug}   (${workspace.id})`)

  await ensureMembership(db, workspace.id, admin.id, 'workspace_admin')
  await ensureMembership(db, workspace.id, orgAdmin.id, 'workspace_admin')
  console.log('  membership  ok')

  await upsertGlobalFlags(db, admin.id)
  console.log(`  flags       ${DEFAULT_ENABLED_FLAGS.length} global defaults`)

  await seedDemoContent(db, workspace.id, admin.id)
  console.log('  demo data   space + project + list + tasks + views + labels + docs + checklist')

  console.log('\n✅  Seed complete')
  console.log('    super admin:')
  console.log(`      email:    ${ADMIN_EMAIL}`)
  console.log(`      password: ${ADMIN_PASSWORD}`)
  console.log('    organization admin:')
  console.log(`      email:    ${ORG_ADMIN_EMAIL}`)
  console.log(`      password: ${ORG_ADMIN_PASSWORD}`)
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err)
  process.exit(1)
})
