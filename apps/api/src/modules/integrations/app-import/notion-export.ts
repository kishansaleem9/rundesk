import { isZip, readZip, ZipReadError, type ZipEntry } from '../../../common/import/zip-read'
import { parseSheet } from '../clickup-import/spreadsheet-import.util'

/**
 * A NOTION WORKSPACE, FROM ITS EXPORT (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * ClickUp imports Notion from its export, not by signing in: "export your
 * workspace from Notion's settings", the whole workspace as Markdown & CSV.
 * "All databases are imported into a single Folder"; each row is a task and
 * "Notion fields become text custom fields"; pages become Docs. Toggles,
 * callouts, columns and code blocks come in as text; inline database
 * comments and attachments do not. (Help centre, "Import from Notion" and its
 * FAQ, read through search excerpts, 13 October.)
 *
 * The export is a zip — sometimes a zip of zips, one per part — in Notion's
 * layout: each page `Title <id>.md`, the pages under it in a folder
 * `Title <id>/`; each database `Name <id>.csv` (and `Name <id>_all.csv`, every
 * row, in later exports), its rows' pages in a folder `Name <id>/`. An id is
 * 32 hex digits, which the titles here leave off.
 */

export class NotionReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotionReadError'
  }
}

export type NotionPage = { key: string; parent: string | null; title: string; markdown: string }
export type NotionRow = { title: string; values: Array<{ name: string; value: string }>; markdown: string | null }
export type NotionDatabase = { key: string; title: string; columns: string[]; rows: NotionRow[] }
export type NotionExport = { pages: NotionPage[]; databases: NotionDatabase[] }

export const MAX_NOTION_PAGES = 2_000
export const MAX_NOTION_ROWS = 20_000

const ID = /\s+[0-9a-f]{32}$/i
/** A file or folder name without its extension and Notion's id. */
export const notionTitle = (name: string) => name.replace(/\.(md|csv)$/i, '').replace(/_all$/i, '').replace(ID, '').trim() || 'Untitled'
const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
const baseOf = (path: string) => path.replace(/(_all)?\.(md|csv)$/i, '')

function entriesOf(buf: Buffer): Map<string, ZipEntry> {
  if (!isZip(buf)) throw new NotionReadError('This is not a Notion export: export the workspace as Markdown & CSV, and choose the zip it downloads')
  let entries: Map<string, ZipEntry>
  try {
    entries = readZip(buf)
  } catch (e) {
    throw new NotionReadError(e instanceof ZipReadError ? `The export could not be read: ${e.message}` : 'The export could not be read')
  }
  // A large workspace downloads as a zip of parts, each a zip.
  const inner = [...entries.values()].filter((e) => /\.zip$/i.test(e.name))
  const own = [...entries.values()].filter((e) => /\.(md|csv)$/i.test(e.name))
  if (inner.length && !own.length) {
    const merged = new Map<string, ZipEntry>()
    for (const part of inner) {
      try {
        for (const [name, e] of readZip(part.read())) merged.set(name, e)
      } catch (e) {
        throw new NotionReadError(e instanceof ZipReadError ? `A part of the export could not be read: ${e.message}` : 'A part of the export could not be read')
      }
    }
    return merged
  }
  return entries
}

/** A row page's Markdown without its title and the properties Notion writes under it: its body. */
export function rowBody(md: string): string | null {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  if (/^#\s/.test(lines[0] ?? '')) i = 1
  while (i < lines.length && !lines[i]!.trim()) i++
  // The properties: "Name: value" lines, up to the first blank line.
  const start = i
  while (i < lines.length && /^[^\s:#][^:]{0,80}:\s/.test(lines[i]!)) i++
  if (i === start) i = start
  const body = lines.slice(i).join('\n').trim()
  return body || null
}

export function readNotionExport(buf: Buffer): NotionExport {
  const entries = entriesOf(buf)
  const files = [...entries.values()].filter((e) => !e.name.endsWith('/') && !/(^|\/)__MACOSX\//.test(e.name))
  const csvs = files.filter((e) => /\.csv$/i.test(e.name))
  const mds = files.filter((e) => /\.md$/i.test(e.name))

  // Each database once: its `_all` file when it has one, which holds every row.
  const dbFiles = new Map<string, ZipEntry>()
  for (const e of csvs) {
    const base = baseOf(e.name)
    if (!dbFiles.has(base) || /_all\.csv$/i.test(e.name)) dbFiles.set(base, e)
  }
  const rowPages = new Map<string, Map<string, string>>()
  const pages: NotionPage[] = []
  const pageBases = new Set(mds.map((e) => baseOf(e.name)))
  for (const e of mds) {
    const dir = dirOf(e.name)
    if (dbFiles.has(dir)) {
      // A row's page, under its database's folder: its body is the task's description.
      const rows = rowPages.get(dir) ?? new Map<string, string>()
      rows.set(notionTitle(e.name.slice(dir.length + 1)).toLowerCase(), e.text())
      rowPages.set(dir, rows)
      continue
    }
    if (pages.length >= MAX_NOTION_PAGES) continue
    const text = e.text()
    const heading = /^#\s+(.+)$/m.exec(text.split('\n').slice(0, 3).join('\n'))?.[1]?.trim()
    pages.push({ key: baseOf(e.name), parent: dir && pageBases.has(dir) ? dir : null, title: (heading || notionTitle(e.name.split('/').pop()!)).slice(0, 500), markdown: text })
  }

  const databases: NotionDatabase[] = []
  let total = 0
  for (const [base, e] of dbFiles) {
    const table = parseSheet(e.text(), ',')
    if (!table.headers.length) continue
    // The title is the first column, as Notion writes it ("Name", unless renamed).
    const titleAt = 0
    const rows: NotionRow[] = []
    const pagesOf = rowPages.get(base)
    for (const r of table.rows) {
      if (total >= MAX_NOTION_ROWS) break
      const title = (r.cells[titleAt] ?? '').trim()
      if (!title && r.cells.every((c) => !c.trim())) continue
      const md = pagesOf?.get(title.toLowerCase())
      rows.push({
        title: title || 'Untitled',
        values: table.headers.map((name, i) => ({ name, value: (r.cells[i] ?? '').trim() })).filter((v, i) => i !== titleAt && v.name && v.value),
        markdown: md ? rowBody(md) : null,
      })
      total++
    }
    databases.push({ key: base, title: notionTitle(base.split('/').pop()!), columns: table.headers.filter((_, i) => i !== titleAt), rows })
  }
  return { pages, databases }
}
