import { api } from './api'

/** §V2-14 — one of this person's own calendar accounts, as the Accounts page lists it. */
export type CalendarAccount = {
  id: string
  provider: string
  externalAccountEmail: string | null
  status: string
  isDefault: boolean
  countsAsBusy: boolean
}

/**
 * THIS PERSON'S CALENDAR ACCOUNTS — the one read of them, for every place that
 * asks: the planner's Accounts page, its onboarding panel ("connected none?")
 * and the Meetings page's "Connect Calendar", which is offered to whoever has
 * none. One key, so connecting or disconnecting one answers all three.
 */
export const calendarAccountsQuery = (workspaceId: string) => ({
  queryKey: ['calendar-accounts', workspaceId] as const,
  queryFn: () => api<CalendarAccount[]>(`/workspaces/${workspaceId}/calendar-sync/accounts`),
})
