import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { htmlFileToDoc, htmlToTiptap, parseHtml, findElement, textContent } from './html-tiptap'
import { tiptapToMarkdown } from './tiptap-markdown'

/**
 * AN HTML PAGE AS A DOC (`commit-log/log-601eacc-2`): the blocks a Doc holds,
 * read from HTML as a browser would read it where it is loose.
 */
const md = (html: string) => tiptapToMarkdown(htmlToTiptap(html)).trim()

describe('htmlToTiptap — the blocks a Doc holds', () => {
  it('reads headings, paragraphs, marks and links, and leaves out the head, scripts and styles', () => {
    const html =
      '<html><head><title>T</title><style>p{}</style><script>alert(1)</script></head><body>' +
      '<h2>Plan</h2><p>Some <b>bold</b>, <em>italic</em>, <s>gone</s>, <code>x()</code> and <a href="https://example.com/a">a link</a>.</p>' +
      '<p>Line one<br>line two</p></body></html>'
    assert.equal(md(html), '## Plan\n\nSome **bold**, *italic*, ~~gone~~, `x()` and [a link](https://example.com/a).\n\nLine one\nline two')
  })

  it('reads lists, nested, and a task list with its ticked items', () => {
    assert.equal(md('<ul><li>One<ul><li>One.a</li></ul></li><li>Two</ul><ol><li>First<li>Second</ol>'), '- One\n  - One.a\n- Two\n\n1. First\n2. Second')
    assert.equal(md('<ul class="inline-task-list"><li class="checked" data-inline-task-id="1">Done thing</li><li data-inline-task-id="2">Open thing</li></ul>'), '- [x] Done thing\n- [ ] Open thing')
  })

  it('reads a table, its header row as a header, and a quote, code and a rule', () => {
    const doc = htmlToTiptap('<table><thead><tr><th>Name</th><th>Owner</th></tr></thead><tbody><tr><td>Alpha</td><td>Ana</td></tr></tbody></table><blockquote><p>Quoted</p></blockquote><pre><code class="language-ts">const a = 1\n</code></pre><hr>')
    assert.deepEqual(doc.content.map((n) => n.type), ['table', 'blockquote', 'codeBlock', 'horizontalRule'])
    assert.equal(doc.content[0].content![0].content![0].type, 'tableHeader')
    assert.equal(doc.content[2].attrs?.language, 'ts')
    assert.equal(md('<table><tr><th>Name</th><th>Owner</th></tr><tr><td>Alpha</td><td>Ana</td></tr></table>'), '| Name | Owner |\n| --- | --- |\n| Alpha | Ana |')
  })

  it('closes an unclosed paragraph where the next block starts, and an unclosed cell where the next one does', () => {
    assert.equal(md('<p>First<p>Second<div>Third</div>'), 'First\n\nSecond\n\nThird')
    assert.equal(md('<table><tr><td>a<td>b<tr><td>c<td>d</table>'), '|  |  |\n| --- | --- |\n| a | b |\n| c | d |')
  })

  it('says where an image of the export stood, keeps one with a web address, and drops a link that leads nowhere from here', () => {
    const doc = htmlToTiptap('<p><img src="attachments/12/diagram.png" alt=""> <img src="https://cdn.example.com/x.png" alt="x"> <a href="Other-page_42.html">Other page</a> <a href="javascript:alert(1)">bad</a></p>')
    const inline = doc.content[0].content!
    assert.equal(inline[0].text, '[Image: diagram.png] ')
    assert.equal(inline[1].type, 'image')
    assert.equal(inline[1].attrs?.src, 'https://cdn.example.com/x.png')
    assert.ok(inline.every((n) => !(n.marks ?? []).some((m) => m.type === 'link')), 'no link to a page of the export, nor to javascript:')
  })

  it('decodes the named references a page holds, beyond XML’s five', () => {
    assert.equal(md('<p>A&nbsp;B &mdash; C &hellip; &ldquo;q&rdquo; &copy; &#8364;</p>'), 'A B — C … “q” © €')
  })
})

describe('htmlFileToDoc — a page as a Doc with a title', () => {
  it('its title is the page’s <title>, and a first <h1> saying the same is not said twice', () => {
    const doc = htmlFileToDoc('<title>Runbook</title><h1>Runbook</h1><p>Steps.</p>', 'runbook.html')
    assert.equal(doc.title, 'Runbook')
    assert.deepEqual(doc.content.content.map((n) => n.type), ['paragraph'])
  })

  it('with no <title>, a first <h1> is the title; with neither, the file’s name', () => {
    assert.equal(htmlFileToDoc('<h1>From the heading</h1><p>x</p>', 'a.html').title, 'From the heading')
    assert.equal(htmlFileToDoc('<p>Only words</p>', 'Meeting notes.htm').title, 'Meeting notes')
  })
})

describe('parseHtml — finding things in a page', () => {
  it('finds an element by its id and reads its text', () => {
    const root = parseHtml('<div id="main-content"><p>Hi <b>there</b></p></div>')
    assert.equal(textContent(findElement(root, (e) => e.attrs.id === 'main-content')!), 'Hi there')
  })
})
