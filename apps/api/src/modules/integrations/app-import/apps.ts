import type { AppDef, AppKey } from './app-def'
import { ASANA } from './asana'
import { CLICKUP } from './clickup'
import { JIRA } from './jira'
import { MONDAY } from './monday'
import { TODOIST } from './todoist'
import { TRELLO } from './trello'
import { WRIKE } from './wrike'

/**
 * The six tools ClickUp signs in to for an import (`found-13-oct/importers-by-sign-in-unbuilt`), in the import page's
 * order; and ClickUp itself, a whole Workspace and its people (`found-14-oct/clickup-workspace-import-and-people-unbuilt`).
 */
export const APPS: Record<AppKey, AppDef> = { asana: ASANA, jira: JIRA, monday: MONDAY, todoist: TODOIST, trello: TRELLO, wrike: WRIKE, clickup: CLICKUP }

/** The Apps tab's tools: the six. ClickUp has a tab of its own, beside its CSV import. */
export const APPS_TAB: AppDef[] = [ASANA, JIRA, MONDAY, TODOIST, TRELLO, WRIKE]
