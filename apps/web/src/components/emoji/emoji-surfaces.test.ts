import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * §2.8 gap 7 — every place that offers emoji offers all of them.
 *
 * The gap the client raised was not "the picker is ugly", it was that three
 * separate surfaces each carried their own little hard-coded strip: twelve in
 * the composer, six on a message, six in a call. Each was easy to add and each
 * looked finished, which is exactly why they were all still there.
 *
 * This reads the files. It cannot be satisfied by adding the picker in a fourth
 * place while leaving a strip behind in a third.
 */

const web = join(dirname(fileURLToPath(import.meta.url)), '../..')

const SURFACES = [
  { file: 'components/chat/chat-composer.tsx', what: 'the message composer' },
  { file: 'pages/workspace-chat-page.tsx', what: 'reacting to a message' },
  { file: 'components/call/call-surface.tsx', what: 'reacting inside a call' },
]

/** A quoted literal that is nothing but emoji — i.e. an entry in a strip. */
const EMOJI_LITERAL = /'((?:\p{Extended_Pictographic}|‍|️|[\u{1F3FB}-\u{1F3FF}])+)'/gu

describe('§2.8 the emoji picker is the only picker', () => {
  for (const { file, what } of SURFACES) {
    const source = readFileSync(join(web, file), 'utf8')

    it(`${what} opens the full library`, () => {
      assert.match(
        source,
        /import \{[^}]*\bEmojiPicker\b[^}]*\} from/,
        `${file} does not import EmojiPicker`,
      )
      assert.ok(source.includes('<EmojiPicker'), `${file} imports EmojiPicker but never renders it`)
    })

    it(`${what} keeps no hard-coded stand-in for the library`, () => {
      // Four is the line, not three. The client asked for exactly three
      // one-tap reactions on the message hover bar — "👍 ✅ 🔥" — and that row
      // is a shortcut sitting next to the picker, not a substitute for it.
      // Four or more is somebody rebuilding a strip.
      const found = [...source.matchAll(EMOJI_LITERAL)]
      for (let i = 0; i + 3 < found.length; i++) {
        const span = found[i + 3].index! - found[i].index!
        assert.ok(
          span > 260,
          `${file} still has a hard-coded emoji strip near character ${found[i].index}: ` +
            found.slice(i, i + 4).map((m) => m[1]).join(' '),
        )
      }
    })
  }

  it('has one shared component, not one per surface', () => {
    // If a second picker is ever added, this is the line that notices.
    const pickers = SURFACES.map(({ file }) => readFileSync(join(web, file), 'utf8')).filter((s) =>
      /function \w*EmojiPicker\w*\(/.test(s),
    )
    assert.equal(pickers.length, 0, 'a surface has grown its own emoji picker again')
  })
})
