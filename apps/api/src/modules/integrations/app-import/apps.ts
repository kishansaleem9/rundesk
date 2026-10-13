import type { AppDef, AppKey } from './app-def'
import { ASANA } from './asana'
import { JIRA } from './jira'
import { MONDAY } from './monday'
import { TODOIST } from './todoist'
import { TRELLO } from './trello'
import { WRIKE } from './wrike'

/** The six tools ClickUp signs in to for an import (`found-13-oct/importers-by-sign-in-unbuilt`), in the import page's order. */
export const APPS: Record<AppKey, AppDef> = { asana: ASANA, jira: JIRA, monday: MONDAY, todoist: TODOIST, trello: TRELLO, wrike: WRIKE }
