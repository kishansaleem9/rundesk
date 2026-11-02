/*
 * SEVERAL ADDRESSES, AS SOMEBODY PASTES THEM (QA WS-010: "Paste 3 emails
 * separated by comma, space or new line. All valid emails invited; any invalid
 * email flagged on its own").
 *
 * Separated by commas, semicolons, spaces, tabs or line breaks, in any mix, as
 * a spreadsheet column or a mail client's To line gives them. A "Name
 * <address>" from a mail client is its address. The same address twice, in any
 * case, is asked once. What is not an address is kept as typed, to be shown.
 *
 * The shape asked is the API's own (`apps/api/src/common/email-address.ts`),
 * which refuses the same things whatever sends them.
 */
const ADDRESS = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:".]+(\.[^\s@<>()[\]\\,;:".]+)+$/

export function isEmailAddress(text: string): boolean {
  return text.length <= 254 && ADDRESS.test(text)
}

export type EmailList = { valid: string[]; invalid: string[] }

export function parseEmailList(text: string): EmailList {
  const valid: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  // A "Name <address>" is its address; the name, words and all, is not asked.
  const flattened = text.replace(/[^,;\n<>]*<([^<>]*)>/g, ' $1 ')
  for (const raw of flattened.split(/[\s,;]+/)) {
    const token = raw.replace(/^[<("'[]+|[>)"'\].]+$/g, '').trim()
    if (!token) continue
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    ;(isEmailAddress(token) ? valid : invalid).push(token)
  }
  return { valid, invalid }
}
