/**
 * THE INBOUND ADDRESS PROTOCOL, IN ONE PLACE: `list-<localPart>@<domain>` makes
 * a task in the list, `list-<localPart>+task-<id>@<domain>` comments on the
 * task. The email-to-task module parses it and composes it for the task sheet;
 * a comment notification's Reply-To composes it too. Two copies of the format
 * would be two places for the next change to miss, and the failure is mail
 * silently going nowhere.
 */
export const LOCAL_PART_PREFIX = 'list-'
export const TASK_TAG = '+task-'

export const inboundDomain = (): string => process.env.INBOUND_EMAIL_DOMAIN ?? 'inbound.rundesk.local'

/** A task's own address, for a list whose alias has `localPart`. */
export const taskReplyAddress = (localPart: string, taskId: string): string =>
  `${LOCAL_PART_PREFIX}${localPart}${TASK_TAG}${taskId}@${inboundDomain()}`
