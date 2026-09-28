/**
 * A LIKE / ILIKE pattern that matches `text` anywhere, taken literally.
 *
 * `%` and `_` are wildcards in a pattern and `\` is its escape, so a search
 * typed as "50%" or "a_b" put straight into `%…%` matches "500" and "axb" too.
 * Postgres's default escape character is the backslash, which this uses.
 */
export function likeContaining(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}
