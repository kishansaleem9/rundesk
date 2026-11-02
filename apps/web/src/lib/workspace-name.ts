/*
 * A WORKSPACE'S NAME, AS THE API KEEPS IT (QA WS-002; the API's
 * `cleanWorkspaceName` in `apps/api/src/modules/workspaces/workspace-ownership.ts`):
 * whitespace of every kind trimmed from either end and folded to one space
 * inside, never blank, 2 to 60 characters as a person counts them — an emoji
 * is one. Asked here so a form says what is wrong before it sends, and the API
 * asks again whatever sends it.
 */
import type { TranslationKey } from './i18n'

export const WORKSPACE_NAME_MIN = 2
export const WORKSPACE_NAME_MAX = 60

// ES2020's library has no `Intl.Segmenter`; every browser this app supports has
// it, and one without it counts code points, which differs only on joined emoji.
type GraphemeSegmenter = { segment(text: string): Iterable<unknown> }
const SegmenterCtor = (Intl as unknown as { Segmenter?: new (locale: undefined, options: { granularity: 'grapheme' }) => GraphemeSegmenter }).Segmenter
const segmenter = SegmenterCtor ? new SegmenterCtor(undefined, { granularity: 'grapheme' }) : null

export function characterCount(text: string): number {
  return Array.from(segmenter ? segmenter.segment(text) : text).length
}

export function cleanWorkspaceName(raw: string): string {
  return raw
    .replace(/[\s\u200b\u2060\ufeff]+/gu, ' ')
    .replace(/^[\s\u200b-\u200d\u2060\ufeff]+|[\s\u200b-\u200d\u2060\ufeff]+$/gu, '')
}

/** What is wrong with the name, as the key of a sentence that says so, or null. */
export function workspaceNameProblem(raw: string): TranslationKey | null {
  const name = cleanWorkspaceName(raw)
  if (!/[^\s\p{Cc}\p{Cf}\p{Z}]/u.test(name)) return 'workspaceName.blank'
  const count = characterCount(name)
  if (count < WORKSPACE_NAME_MIN) return 'workspaceName.short'
  if (count > WORKSPACE_NAME_MAX) return 'workspaceName.long'
  return null
}
