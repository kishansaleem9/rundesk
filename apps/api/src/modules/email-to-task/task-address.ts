import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * THE INBOUND ADDRESS PROTOCOL, IN ONE PLACE: `list-<localPart>@<domain>` makes
 * a task in the list, `list-<tag>+task-<id>@<domain>` comments on the task. The
 * email-to-task module parses it and composes it for the task sheet; a comment
 * notification's Reply-To composes it too. Two copies of the format would be
 * two places for the next change to miss, and the failure is mail silently
 * going nowhere.
 */
export const LOCAL_PART_PREFIX = 'list-'
export const TASK_TAG = '+task-'

export const inboundDomain = (): string => process.env.INBOUND_EMAIL_DOMAIN ?? 'inbound.rundesk.local'

/**
 * A TASK'S ADDRESS CARRIES A TAG OF ITS LIST'S ALIAS, NOT THE ALIAS. The alias
 * is the list's address, and mail to that makes a task for whoever sends it;
 * a task's address went to everybody who may read the task — in the task menu,
 * and as the Reply-To of every notification — and cutting its `+task-<id>` off
 * left the list's address (`found-25-sep/list-address-read-by-those-who-may-not-add`).
 * The tag is an HMAC of the task id under the alias: it names this task and no
 * other, cannot be turned back into the alias, and changes when the alias is
 * rotated, as the address did.
 */
export const taskAddressTag = (localPart: string, taskId: string): string =>
  createHmac('sha256', localPart).update(taskId.toLowerCase()).digest('hex').slice(0, 16)

/** A task's own address, for a list whose alias has `localPart`. */
export const taskReplyAddress = (localPart: string, taskId: string): string =>
  `${LOCAL_PART_PREFIX}${taskAddressTag(localPart, taskId)}${TASK_TAG}${taskId}@${inboundDomain()}`

/**
 * Whether the part of a task's address before `+task-` belongs to this task
 * under this alias: its tag, or — for mail answering an address given out
 * before tags — the alias itself, which the sender then already had.
 */
export const taskAddressMatches = (given: string, localPart: string, taskId: string): boolean => {
  const same = (a: string, b: string) => {
    const x = Buffer.from(a)
    const y = Buffer.from(b)
    return x.length === y.length && timingSafeEqual(x, y)
  }
  return same(given, taskAddressTag(localPart, taskId)) || same(given, localPart)
}

/**
 * AN EMAIL SENT FROM A TASK'S COMMENT BOX IS ANSWERED AT AN ADDRESS OF ITS OWN
 * (`resume-defects/s4-composer-email`): `reply-<id>@domain`, `<id>` the outbound
 * message's row. Not the list's address: that carries the list's alias, the
 * secret that lets mail make tasks in it, and an email goes to people outside
 * the workspace. Knowing this one lets nobody in — a reply is taken from that
 * email's own recipients, or from a member who may comment on the task.
 */
export const EMAIL_REPLY_PREFIX = 'reply-'
export const emailReplyAddress = (outboundId: string): string => `${EMAIL_REPLY_PREFIX}${outboundId}@${inboundDomain()}`
