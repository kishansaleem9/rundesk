/**
 * The blocks a slash menu offers, and the markdown each one inserts.
 *
 * §G15 `[22:28]` gave the task DESCRIPTION a slash menu; §V2-S05c frame `04:50`
 * puts "Slash commands" in the comment composer's "+" menu too. Both need the
 * same list, so it lives here rather than in whichever component got it first —
 * one fact, one copy. Two hand-kept lists of blocks would drift the moment
 * either surface gained one, and nothing would fail to compile.
 *
 * WHY MARKDOWN AND NOT A RICH-TEXT MODEL. The description stores markdown and
 * `<Markdown>` renders it; comments store text and now render the same markdown
 * through the same parser. A slash menu that inserted a different representation
 * in the comment box would need a second renderer to make it visible, which is
 * how a product ends up with two kinds of formatting that disagree.
 */
import type { TranslationKey } from './i18n'

export type ComposerBlock = {
  id: string
  labelKey: TranslationKey
  /** What gets inserted at the caret. */
  md: string
}

/**
 * Shared by the description editor and the comment composer.
 *
 * The description additionally offers an `image` block, which is NOT here: an
 * image needs a file uploaded first, so it is an action rather than a piece of
 * markdown to paste in, and it lives with the uploader that can perform it.
 */
export const COMPOSER_BLOCKS: readonly ComposerBlock[] = [
  { id: 'h2', labelKey: 'taskDetail.slash.heading', md: '## ' },
  { id: 'bullet', labelKey: 'taskDetail.slash.bulletList', md: '- ' },
  { id: 'numbered', labelKey: 'taskDetail.slash.numberedList', md: '1. ' },
  { id: 'todo', labelKey: 'taskDetail.slash.todoList', md: '- [ ] ' },
  { id: 'quote', labelKey: 'taskDetail.slash.quote', md: '> ' },
  { id: 'code', labelKey: 'taskDetail.slash.code', md: '```\n\n```\n' },
  {
    id: 'table',
    labelKey: 'taskDetail.slash.table',
    md: '| Column | Column |\n| --- | --- |\n|  |  |\n',
  },
  { id: 'divider', labelKey: 'taskDetail.slash.divider', md: '---\n' },
  { id: 'banner', labelKey: 'taskDetail.slash.banner', md: ':::note\n\n:::\n' },
  { id: 'warning', labelKey: 'taskDetail.slash.warning', md: ':::warn\n\n:::\n' },
] as const

/**
 * Replace the `/query` the caret sits in with a block's markdown.
 *
 * The slash and everything typed after it is what the person is replacing —
 * leaving it behind would put `/tab` above their new table. Returns the new
 * text and where the caret should land, so the caller can restore it: inserting
 * a table and dropping the caret at the end of the document is its own small
 * betrayal.
 */
export function applyBlockAtCaret(
  text: string,
  caret: number,
  md: string,
): { text: string; caret: number } {
  const before = text.slice(0, caret)
  const slash = before.lastIndexOf('/')
  // No slash to replace: insert at the caret rather than guessing.
  const from = slash === -1 ? caret : slash
  const next = text.slice(0, from) + md + text.slice(caret)
  return { text: next, caret: from + md.length }
}

/** The blocks whose label matches what has been typed after the slash. */
export function matchBlocks(
  blocks: readonly ComposerBlock[],
  query: string,
  label: (key: TranslationKey) => string,
): readonly ComposerBlock[] {
  const q = query.trim().toLowerCase()
  if (!q) return blocks
  return blocks.filter((b) => label(b.labelKey).toLowerCase().includes(q) || b.id.includes(q))
}
