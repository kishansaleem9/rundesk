import { api } from './api'

/**
 * THE PLANNER RAIL'S SECTIONS OF ONE'S OWN (`commit-log/log-716d25c-1`,
 * `ledger-rows/row-835`): "+ Add a new section" on the Sidebar page, as ClickUp
 * makes its own sidebar sections — a name and an optional emoji, tasks put in
 * by hand, each in one section at a time; deleting one leaves its tasks as
 * they were. `GET /planner/:ws/sections` answers the caller's own, each with
 * the tasks in it they may still open.
 *
 * In `railSections` a section of one's own is `section:<id>`, beside the five.
 */
export type OwnRailSectionTask = { id: string; title: string; status: string; dueDate: string | null }
export type OwnRailSection = { id: string; name: string; emoji: string | null; createdAt: string; tasks: OwnRailSectionTask[] }

export const SECTION_KEY_PREFIX = 'section:'
export type OwnSectionKey = `section:${string}`
export const sectionKey = (id: string): OwnSectionKey => `section:${id}`
export const sectionIdOf = (key: string): string | null =>
  key.startsWith(SECTION_KEY_PREFIX) ? key.slice(SECTION_KEY_PREFIX.length) : null

export const plannerSectionsKey = (workspaceId: string) => ['planner-sections', workspaceId] as const
export const plannerSectionsQuery = (workspaceId: string) => ({
  queryKey: plannerSectionsKey(workspaceId),
  queryFn: () => api<OwnRailSection[]>(`/planner/${workspaceId}/sections`),
})

/** What a section's heading says: its emoji, when it has one, before its name. */
export const sectionLabel = (s: Pick<OwnRailSection, 'name' | 'emoji'>) => (s.emoji ? `${s.emoji} ${s.name}` : s.name)
