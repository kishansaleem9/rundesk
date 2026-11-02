/*
 * AN EMAIL ADDRESS, AS FAR AS ITS SHAPE SAYS (`found-02-nov/invitation-takes-any-text`):
 * one `@`, something before it, a domain after it with a dot and no empty
 * label, nothing that is a space or that a pasted "Name <address>" or a list
 * brings with it, and no more than 254 characters (RFC 5321's limit on a path).
 * Whether a mailbox is there is the mail server's to say; this only refuses
 * what could never be one, so an invitation is never made out to "Ada" or to
 * "ada@example" and mailed.
 */
const ADDRESS = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:".]+(\.[^\s@<>()[\]\\,;:".]+)+$/

export function isEmailAddress(text: unknown): text is string {
  return typeof text === 'string' && text.length <= 254 && ADDRESS.test(text)
}
