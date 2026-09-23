import type { TranslationKey } from './i18n'

/**
 * Display labels for the server's webhook event ids. The server's catalog
 * (`GET /workspaces/:id/webhooks/events`) is the one list of events; the id is
 * what is sent and stored, only its label is translated, and an id with no
 * label here falls back to itself.
 *
 * ONE MAP FOR BOTH PAGES THAT MAKE WEBHOOKS. The settings card kept its own
 * hardcoded list of ten ids, shown raw and missing four of the server's
 * fourteen, while the admin page had this map without `member.joined`.
 */
export const WEBHOOK_EVENT_LABEL_KEYS: Record<string, TranslationKey> = {
  'task.created': 'adminWebhooks.event.taskCreated',
  'task.updated': 'adminWebhooks.event.taskUpdated',
  'task.deleted': 'adminWebhooks.event.taskDeleted',
  'task.status_changed': 'adminWebhooks.event.taskStatusChanged',
  'task.assigned': 'adminWebhooks.event.taskAssigned',
  'task.assignee_changed': 'adminWebhooks.event.taskAssigneeChanged',
  'comment.created': 'adminWebhooks.event.commentCreated',
  'project.created': 'adminWebhooks.event.projectCreated',
  'project.updated': 'adminWebhooks.event.projectUpdated',
  'member.invited': 'adminWebhooks.event.memberInvited',
  'member.joined': 'adminWebhooks.event.memberJoined',
  'member.removed': 'adminWebhooks.event.memberRemoved',
  'time.logged': 'adminWebhooks.event.timeLogged',
  'form.submitted': 'adminWebhooks.event.formSubmitted',
}

export function webhookEventLabel(t: (key: TranslationKey) => string, event: string): string {
  const key = WEBHOOK_EVENT_LABEL_KEYS[event]
  return key ? t(key) : event
}
