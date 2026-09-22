/**
 * THE ROUND TRIP, WHICH IS THE CHECK A FACADE CANNOT PASS.
 *
 * `markdownToTiptap` exists to serve frame `12:05`'s **Document files** import,
 * and the danger with any importer is that "it worked" is trivially easy to
 * assert and nearly worthless: an importer that dropped the whole file into one
 * paragraph would satisfy every check anyone would think to write — a doc was
 * created, it is non-empty, the request returned 200.
 *
 * So the property asserted here is that the two halves AGREE:
 *
 *     markdown → tiptap → markdown  ===  markdown
 *
 * `tiptapToMarkdown` was already in the tree and is not changed by this work,
 * which is what makes it a fair judge: it has no knowledge of the parser and
 * was not written to accommodate it. A parser that lost a heading level, a
 * nested list's indent, a task item's checkbox or a link's href cannot come
 * back through it unchanged.
 *
 * THE DIRECTION MATTERS. Asserting `tiptap → markdown → tiptap` would need deep
 * equality over JSON whose attrs legitimately differ (an absent `attrs` versus
 * `{}`), so it would be a test about object shape rather than about meaning.
 * Text either comes back or it does not.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { markdownToTiptap, tiptapToMarkdown, splitTitleFromMarkdown } from './tiptap-markdown'

/** markdown → tiptap → markdown, with the trailing newline the exporter adds. */
const round = (md: string) => tiptapToMarkdown(markdownToTiptap(md))

const holds = (name: string, md: string) =>
  test(`round trip: ${name}`, () => {
    assert.equal(round(md), md.endsWith('\n') ? md : `${md}\n`)
  })

holds('a heading and a paragraph', '# Title\n\nA line of prose.\n')
holds('every heading level', '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n')
holds('inline marks', 'Some **bold**, some *italic*, some ~~struck~~ and some `code`.\n')
holds('a link', 'See [the docs](https://example.com/a?b=c) for more.\n')
holds('an image', '![a picture](https://example.com/p.png)\n')
holds('a bullet list', '- one\n- two\n- three\n')
holds('an ordered list', '1. first\n2. second\n3. third\n')
holds('a task list, both states', '- [ ] not yet\n- [x] done\n')
holds('a nested bullet list', '- outer\n  - inner\n- second outer\n')
holds('a blockquote', '> quoted words\n')
holds('a fenced code block with a language', '```ts\nconst a = 1\n```\n')
holds('a fenced code block with no language', '```\nplain\n```\n')
holds('a horizontal rule', 'Above.\n\n---\n\nBelow.\n')
holds('a GFM table', '| a | b |\n| --- | --- |\n| 1 | 2 |\n')

/*
 * THE ONES THAT WOULD HAVE PASSED A WEAKER TEST. Each of these is a specific
 * way a plausible parser loses meaning while still producing a document.
 */

test('code spans are literal — markup inside them is not markup', () => {
  const doc = markdownToTiptap('Use `**not bold**` here.\n')
  const runs = (doc.content[0].content ?? []) as Array<{ text?: string; marks?: Array<{ type: string }> }>
  const code = runs.find((r) => r.marks?.some((m) => m.type === 'code'))
  assert.equal(code?.text, '**not bold**', 'the asterisks inside a code span are text')
  assert.equal(round('Use `**not bold**` here.\n'), 'Use `**not bold**` here.\n')
})

test('a soft line break inside a paragraph survives as a hardBreak', () => {
  const doc = markdownToTiptap('first line\nsecond line\n')
  assert.equal(doc.content.length, 1, 'one paragraph, not two')
  const kinds = (doc.content[0].content ?? []).map((n) => n.type)
  assert.ok(kinds.includes('hardBreak'), `joined with a space instead: ${kinds.join(',')}`)
})

test('a task list keeps WHICH items were checked', () => {
  const doc = markdownToTiptap('- [x] done\n- [ ] not\n')
  const items = (doc.content[0].content ?? []) as Array<{ attrs?: { checked?: boolean } }>
  assert.deepEqual(
    items.map((it) => it.attrs?.checked),
    [true, false],
    'a parser that defaulted every box to one state would still round trip its own output',
  )
})

test('a heading keeps its LEVEL, not just its text', () => {
  const doc = markdownToTiptap('### Third\n')
  assert.equal(doc.content[0].attrs?.level, 3)
})

test('a link keeps its href', () => {
  const doc = markdownToTiptap('[label](https://example.com/x)\n')
  const runs = (doc.content[0].content ?? []) as Array<{ marks?: Array<{ type: string; attrs?: { href?: string } }> }>
  const link = runs[0]?.marks?.find((m) => m.type === 'link')
  assert.equal(link?.attrs?.href, 'https://example.com/x')
})

test('an unrecognised line is kept as a paragraph rather than dropped', () => {
  const doc = markdownToTiptap('::: some directive we do not know :::\n')
  assert.equal(doc.content.length, 1)
  assert.equal(doc.content[0].type, 'paragraph')
  assert.match(tiptapToMarkdown(doc), /some directive/)
})

test('an unclosed code fence imports the code it has', () => {
  // A truncated file should not cost the reader the whole document.
  const doc = markdownToTiptap('```\nconst a = 1\n')
  assert.equal(doc.content[0].type, 'codeBlock')
  assert.equal((doc.content[0].content?.[0] as { text?: string })?.text, 'const a = 1')
})

test('empty input is an empty doc, not a doc holding an empty paragraph', () => {
  assert.deepEqual(markdownToTiptap(''), { type: 'doc', content: [] })
  assert.deepEqual(markdownToTiptap('   \n\n  \n'), { type: 'doc', content: [] })
})

/*
 * AND A WHOLE DOCUMENT, because the cases above each exercise one block in
 * isolation and a parser can get every block right while losing the order or
 * the blank lines between them.
 */
test('a whole document round trips', () => {
  const md = [
    '# Release notes',
    '',
    'This release adds **imports** and fixes a `parser` bug.',
    '',
    '## What changed',
    '',
    '- a bullet',
    '  - a nested bullet',
    '- another bullet',
    '',
    '1. first',
    '2. second',
    '',
    '- [x] shipped',
    '- [ ] documented',
    '',
    '> A quoted remark.',
    '',
    '```sql',
    'select 1',
    '```',
    '',
    '---',
    '',
    '| column | meaning |',
    '| --- | --- |',
    '| one | the first |',
    '',
    'See [the docs](https://example.com) and ![a shot](https://example.com/s.png).',
    '',
  ].join('\n')
  assert.equal(round(md), md)
})

/*
 * ─── THE DOC-LEVEL ROUND TRIP ─────────────────────────────────────────────
 *
 * The cases above prove the two CONVERTERS agree. They cannot prove the two
 * ENDPOINTS do, because a doc's title lives outside its content:
 * `exportDocMarkdown` prepends `# <title>` when the body has no leading H1, so
 * an importer that did not consume one would give the doc a duplicate heading —
 * and every further export/import cycle would add another. The content round
 * trip stays green throughout, because the content really is preserved. It is
 * the DOCUMENT that drifts.
 *
 * These assert the title rule directly, against the same pure functions the
 * service uses, so the property is pinned without needing a database.
 */

/** What `exportDocMarkdown` produces for a doc: `# title` then the body. */
const exported = (title: string, content: unknown) => {
  const body = tiptapToMarkdown(content)
  return body.startsWith('# ') ? body : `# ${title}\n\n${body}`
}

/*
 * THE REAL RULE, imported rather than re-stated. This block first carried a
 * COPY of the service's title logic, which is the duplicated list: the two
 * could drift apart and every case here would still pass while the endpoint
 * was wrong. `splitTitleFromMarkdown` is now exported from the module the
 * service calls, so these cases exercise the rule that actually runs.
 */
const imported = (fileName: string, md: string) => splitTitleFromMarkdown(md, fileName)

test('a doc survives export → import with its title intact and no duplicate heading', () => {
  const content = markdownToTiptap('Some prose.\n\n## A section\n\n- a point\n')
  const md = exported('Release notes', content)
  const back = imported('release-notes.md', md)
  assert.equal(back.title, 'Release notes')
  assert.equal(
    tiptapToMarkdown(back.content),
    tiptapToMarkdown(content),
    'the body came back changed — most likely the title heading was kept as content',
  )
})

test('and survives a SECOND cycle, which is where a duplicate heading shows', () => {
  const content = markdownToTiptap('Some prose.\n')
  const once = imported('x.md', exported('Title', content))
  const twice = imported('x.md', exported(once.title, once.content))
  assert.equal(twice.title, 'Title')
  assert.equal(tiptapToMarkdown(twice.content), tiptapToMarkdown(content))
})

test('a file with no leading H1 takes its title from the file name', () => {
  const back = imported('Meeting notes.md', 'Just prose, no heading.\n')
  assert.equal(back.title, 'Meeting notes')
})

test('with no H1 and no file name the title is Untitled, not empty', () => {
  // A doc whose title is '' is unfindable and renders as a blank row. Untitled
  // is the LAST resort rather than the first, which is why the two cases above
  // exist — but it has to be there.
  assert.equal(imported('', 'Just prose.\n').title, 'Untitled')
})

test('a leading H2 is not promoted to the title', () => {
  // Only an H1 is the title, because only an H1 is what export writes. A rule
  // of "the first heading" would rename a doc whose first section is an H2.
  const back = imported('quarterly.md', '## Summary\n\nBody.\n')
  assert.equal(back.title, 'quarterly')
  assert.match(tiptapToMarkdown(back.content), /## Summary/)
})

test('a heading further down is NOT taken as the title', () => {
  // Taking it would silently reorder the reader's own headings.
  const back = imported('notes.md', 'Opening line.\n\n# Later heading\n')
  assert.equal(back.title, 'notes')
  assert.match(tiptapToMarkdown(back.content), /# Later heading/)
})
