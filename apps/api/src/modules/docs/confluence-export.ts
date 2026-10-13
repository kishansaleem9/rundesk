import { readZip, ZipReadError, type ZipEntry } from '../../common/import/zip-read'
import { decodeText } from '../../common/import/text-decode'
import { findElement, findElements, hasClass, htmlToTiptap, parseHtml, textContent, type DocNode, type HtmlElement } from './html-tiptap'

/**
 * CONFLUENCE'S SPACE EXPORT, READ AS ITS PAGES (`commit-log/log-601eacc-2`).
 *
 * ClickUp imports Confluence from the space's HTML export: Space settings ›
 * Export space › HTML › Normal export, a zip, uploaded on Imports / Exports'
 * Confluence row, and made into a Doc in the Docs hub (help centre, "Import
 * from Confluence", read through search excerpts, 13 October). That zip holds
 * a folder named for the space with
 *   · `index.html` — the space's name and, under "Available Pages", the page
 *     tree: nested lists of links, a page's children under it;
 *   · one HTML file per page, its words in `#main-content`, its title in
 *     `#title-text` ("Space : Page"), its place in `#breadcrumbs`;
 *   · `attachments/`, `images/` and `styles/`, which a Doc does not read.
 *
 * READ HERE INTO THE PAGES IN THEIR TREE, parents before children, each page's
 * content through the HTML reader (`html-tiptap.ts`). A page the tree names and
 * the zip lacks is reported, not invented; a page file the tree does not name
 * is placed by its breadcrumbs. Nothing here writes: `DocsService` makes the
 * Docs, one for the space with each page a page inside it.
 */

export class ConfluenceReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfluenceReadError'
  }
}

export type ConfluencePage = {
  /** The page's file in the export, which its children name it by. */
  file: string
  title: string
  /** The parent page's file, or null for a page at the top of the space. */
  parent: string | null
  content: { type: 'doc'; content: DocNode[] }
}

export type ConfluenceSpace = {
  name: string
  /** Parents before their children, in the space's own order. */
  pages: ConfluencePage[]
  /** Pages the tree names that the export does not hold. */
  missing: string[]
}

/** More pages than this are not imported in one go: the rest are named as missing. */
export const MAX_CONFLUENCE_PAGES = 2_000

const LIMITS = { maxEntries: 60_000, maxEntryBytes: 50 * 1024 * 1024, maxTotalBytes: 1024 * 1024 * 1024 }

export function readConfluenceExport(buf: Buffer): ConfluenceSpace {
  let zip: Map<string, ZipEntry>
  try {
    zip = readZip(buf, LIMITS)
  } catch (e) {
    if (e instanceof ZipReadError) throw new ConfluenceReadError(`The Confluence export could not be read: ${e.message}`)
    throw e
  }
  // The space's index: the shallowest index.html in the archive.
  const indexName = [...zip.keys()]
    .filter((n) => /(^|\/)index\.html$/i.test(n))
    .sort((a, b) => a.split('/').length - b.split('/').length)[0]
  if (!indexName) {
    throw new ConfluenceReadError('This zip is not a Confluence space export: it has no index.html. Export the space as HTML (Space settings › Export space › HTML) and upload that zip.')
  }
  const base = indexName.includes('/') ? indexName.slice(0, indexName.lastIndexOf('/') + 1) : ''
  const read = (file: string): HtmlElement | null => {
    const entry = zip.get(base + file) ?? zip.get(decodeURIComponentSafe(base + file))
    return entry ? parseHtml(decodeText(entry.read())) : null
  }

  const index = parseHtml(decodeText(zip.get(indexName)!.read()))
  const name = spaceName(index)

  // The tree under "Available Pages": file → its parent's file, in order.
  const order: Array<{ file: string; parent: string | null }> = []
  const tree = pageTreeList(index)
  if (tree) walkTree(tree, null, order)

  // Page files the tree does not name, placed by their breadcrumbs after the rest.
  const named = new Set(order.map((o) => o.file))
  const loose = [...zip.keys()]
    .filter((n) => n.startsWith(base) && !n.slice(base.length).includes('/') && /\.html?$/i.test(n) && n !== indexName)
    .map((n) => n.slice(base.length))
    .filter((f) => !named.has(f))
    .sort()

  const pages: ConfluencePage[] = []
  const missing: string[] = []
  const made = new Set<string>()
  const take = (file: string, parent: string | null) => {
    if (pages.length >= MAX_CONFLUENCE_PAGES) {
      missing.push(file)
      return
    }
    const root = read(file)
    if (!root) {
      missing.push(file)
      return
    }
    const main = findElement(root, (e) => e.attrs.id === 'main-content') ?? findElement(root, (e) => e.tag === 'body') ?? root
    pages.push({
      file,
      title: pageTitle(root, name, file),
      parent: parent && made.has(parent) ? parent : null,
      content: htmlToTiptap(main),
    })
    made.add(file)
  }
  for (const o of order) take(o.file, o.parent)
  for (const file of loose) {
    const root = read(file)
    take(file, root ? breadcrumbParent(root, made) : null)
  }
  return { name, pages, missing }
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** The space's name: the index page's heading, or its title, without Confluence's " : Home"-style suffix. */
function spaceName(index: HtmlElement): string {
  const heading = findElement(index, (e) => e.attrs.id === 'title-text')
  const title = findElement(index, (e) => e.tag === 'title')
  const raw = (heading ? textContent(heading) : title ? textContent(title) : '').replace(/\s+/g, ' ').trim()
  return raw.replace(/\s*:\s*Home$/i, '') || 'Confluence'
}

/** A page's title: `#title-text` or `<title>`, without the "Space : " Confluence puts before it. */
function pageTitle(root: HtmlElement, space: string, file: string): string {
  const heading = findElement(root, (e) => e.attrs.id === 'title-text')
  const title = findElement(root, (e) => e.tag === 'title')
  let raw = (heading ? textContent(heading) : title ? textContent(title) : '').replace(/\s+/g, ' ').trim()
  const prefix = `${space} : `
  if (raw.startsWith(prefix)) raw = raw.slice(prefix.length)
  if (!raw) raw = file.replace(/(_\d+)?\.html?$/i, '').replace(/[-_]+/g, ' ')
  return raw.slice(0, 500) || 'Untitled'
}

/** The `<ul>` of the index's "Available Pages" section. */
function pageTreeList(index: HtmlElement): HtmlElement | null {
  const sections = findElements(index, (e) => hasClass(e, 'pageSection'))
  for (const s of sections) {
    const heading = findElement(s, (e) => /^h[1-6]$/.test(e.tag))
    if (heading && /available pages/i.test(textContent(heading))) return findElement(s, (e) => e.tag === 'ul')
  }
  return null
}

function walkTree(ul: HtmlElement, parent: string | null, out: Array<{ file: string; parent: string | null }>) {
  for (const li of ul.children) {
    if (!('tag' in li) || li.tag !== 'li') continue
    const link = findElement(li, (e) => e.tag === 'a' && !!e.attrs.href)
    const file = link ? hrefFile(link.attrs.href) : null
    if (file && !out.some((o) => o.file === file)) out.push({ file, parent })
    for (const child of li.children) {
      if ('tag' in child && child.tag === 'ul') walkTree(child, file ?? parent, out)
    }
  }
}

/** A link to a page of the export: its file name, without a fragment or a query. */
function hrefFile(href: string): string | null {
  const file = href.split(/[?#]/)[0]
  if (!file || /^[a-z]+:/i.test(file) || file.includes('/') || !/\.html?$/i.test(file)) return null
  return decodeURIComponentSafe(file)
}

/** The page above this one in its breadcrumbs, when that page has been made. */
function breadcrumbParent(root: HtmlElement, made: Set<string>): string | null {
  const crumbs = findElement(root, (e) => e.attrs.id === 'breadcrumbs')
  if (!crumbs) return null
  const links = findElements(crumbs, (e) => e.tag === 'a' && !!e.attrs.href)
    .map((a) => hrefFile(a.attrs.href))
    .filter((f): f is string => !!f && !/^index\.html?$/i.test(f))
  for (let k = links.length - 1; k >= 0; k--) if (made.has(links[k])) return links[k]
  return null
}
