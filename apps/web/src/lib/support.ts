/**
 * Where someone goes when the app has stopped helping them.
 *
 * Shared rather than declared per page: the Help page and the invitation
 * screen are reached by different people at different moments, and an address
 * that drifts between them is one that someone eventually mails into a void.
 */
export const SUPPORT_EMAIL = 'support@theaura.agency'

/**
 * A mailto with the subject already filled in.
 *
 * The person writing has, by definition, hit something that did not work; not
 * making them describe it in a subject line is the smallest possible courtesy,
 * and it means the mail arrives already sorted.
 */
export function supportMailto(subject: string, body?: string): string {
  const params = new URLSearchParams({ subject })
  if (body) params.set('body', body)
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`
}
