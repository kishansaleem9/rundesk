/**
 * A FILE NAME MADE SAFE FOR THE LAST SEGMENT OF A STORAGE KEY — one rule for
 * every upload route.
 *
 * It was four private copies, in tasks, clips, chat and forms. Three of them
 * called `input.replace(…)` before their `|| 'file'` fallback, so a request
 * with no `fileName` threw a TypeError and answered 500: measured on lane 1,
 * the task attachment presign, the clip presign, the chat attachment presign
 * and record, and the custom-emoji presign all did. The routes take inline body
 * types, so nothing validated the field before it got here. The forms copy
 * guarded it (`(input || '')`), and this is that one.
 *
 * The alphabet is the one `object-key-shape.ts` checks a key's last segment
 * against, so every key built from this passes the shape rules.
 *
 * Pure, and unit-tested in file-name.test.ts.
 */
export function safeFileName(input: unknown, fallback = 'file'): string {
  const raw = typeof input === 'string' ? input : ''
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || fallback
}
