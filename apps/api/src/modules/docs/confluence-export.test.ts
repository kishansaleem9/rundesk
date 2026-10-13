import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { zipOf } from '../../common/import/zip-test-kit'
import { readConfluenceExport, ConfluenceReadError } from './confluence-export'
import { tiptapToMarkdown } from './tiptap-markdown'

/**
 * CONFLUENCE'S SPACE EXPORT READ AS ITS PAGES (`commit-log/log-601eacc-2`):
 * an HTML export as Confluence writes one — `index.html` with the page tree
 * under "Available Pages", a file a page, each page's words in `#main-content`.
 */
const page = (space: string, title: string, body: string, crumbs: Array<[string, string]> = []) =>
  `<html><head><title>${space} : ${title}</title></head><body><div id="page"><div id="main"><div id="main-header">` +
  `<div id="breadcrumb-section"><ol id="breadcrumbs"><li class="first"><span><a href="index.html">${space}</a></span></li>` +
  crumbs.map(([href, name]) => `<li><span><a href="${href}">${name}</a></span></li>`).join('') +
  `</ol></div><h1 id="title-heading" class="pagetitle"><span id="title-text">${space} : ${title}</span></h1></div>` +
  `<div id="content" class="view"><div class="page-metadata">Created by Ana</div><div id="main-content" class="wiki-content group">${body}</div>` +
  '<div class="pageSection group"><div class="pageSectionHeader"><h2 id="attachments" class="pageSectionTitle">Attachments:</h2></div></div>' +
  '</div></div></div></body></html>'

const INDEX =
  '<html><head><title>Team Space : Home</title></head><body><div id="main-header"><h1 id="title-heading"><span id="title-text">Team Space</span></h1></div>' +
  '<div class="pageSection"><div class="pageSectionHeader"><h2 class="pageSectionTitle">Available Pages:</h2></div>' +
  '<ul><li><a href="Home_1.html">Home</a><ul>' +
  '<li><a href="Runbooks_2.html">Runbooks</a><ul><li><a href="Deploy_3.html">Deploy</a></li></ul></li>' +
  '<li><a href="Gone_9.html">Gone</a></li>' +
  '</ul></li></ul></div></body></html>'

describe('readConfluenceExport — a space’s pages in their tree', () => {
  it('reads each page’s title and words, parents before children, as the index nests them', async () => {
    const zip = await zipOf({
      'TS/index.html': INDEX,
      'TS/Home_1.html': page('Team Space', 'Home', '<p>Welcome.</p>'),
      'TS/Runbooks_2.html': page('Team Space', 'Runbooks', '<h2>How we run</h2><ul><li>On call</li></ul>', [['Home_1.html', 'Home']]),
      'TS/Deploy_3.html': page('Team Space', 'Deploy', '<ol><li>Build</li><li>Ship</li></ol><p><img src="attachments/3/flow.png"></p>', [['Home_1.html', 'Home'], ['Runbooks_2.html', 'Runbooks']]),
      'TS/Loose_7.html': page('Team Space', 'Loose notes', '<p>Not in the tree.</p>', [['Home_1.html', 'Home'], ['Runbooks_2.html', 'Runbooks']]),
      'TS/attachments/3/flow.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      'TS/styles/site.css': 'body{}',
    })
    const space = readConfluenceExport(zip)
    assert.equal(space.name, 'Team Space')
    assert.deepEqual(
      space.pages.map((p) => [p.file, p.title, p.parent]),
      [
        ['Home_1.html', 'Home', null],
        ['Runbooks_2.html', 'Runbooks', 'Home_1.html'],
        ['Deploy_3.html', 'Deploy', 'Runbooks_2.html'],
        ['Loose_7.html', 'Loose notes', 'Runbooks_2.html'],
      ],
    )
    assert.deepEqual(space.missing, ['Gone_9.html'], 'a page the tree names and the zip lacks is named, not made')
    const deploy = space.pages.find((p) => p.title === 'Deploy')!
    assert.equal(tiptapToMarkdown(deploy.content).trim(), '1. Build\n2. Ship\n\n[Image: flow.png]', 'only the page’s own words: no breadcrumbs, metadata or attachment list')
  })

  it('refuses a zip that is no space export, and a damaged one, saying how to make the right one', async () => {
    await assert.rejects(async () => readConfluenceExport(await zipOf({ 'notes.txt': 'x' })), /no index\.html.*Export space › HTML/)
    assert.throws(() => readConfluenceExport(Buffer.from('not a zip')), ConfluenceReadError)
  })
})
