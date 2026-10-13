import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { zipOf } from '../../../common/import/zip-test-kit'
import { AppError, AppHttp } from './app-http'
import { ASANA } from './asana'
import { JIRA } from './jira'
import { placeStatus, statusRows, valueFor, type ImNode, type ImTask } from './import-tree'
import { readNotionExport } from './notion-export'
import { adfToMarkdown } from './rich-text'
import { wrikeApi } from './wrike'

/**
 * IMPORTERS BY SIGN-IN (`found-13-oct/importers-by-sign-in-unbuilt`): what a
 * tool's API is asked and trusted with, how each tool's shapes map onto
 * Rundesk's as ClickUp maps them, and Notion's export read.
 */

const ID = (n: number) => String(n).padStart(32, '0')
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** A fetch that answers from a table of addresses, and says what it was asked. */
function fakeFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  const asked: Array<{ url: string; auth: string | null }> = []
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    asked.push({ url, auth: new Headers(init?.headers).get('authorization') })
    const route = Object.keys(routes).find((k) => url.startsWith(k))
    if (!route) return new Response('{"error":"not found"}', { status: 404 })
    return routes[route]!(init)
  }) as typeof fetch
  return { fn, asked }
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

describe('a tool’s API, asked with one person’s grant', () => {
  it('refuses an address off the tool’s own origins — a redirect to one included — and sends the grant to none of them', async () => {
    const { fn, asked } = fakeFetch({ 'https://api.tool.test/next': () => new Response(null, { status: 302, headers: { location: 'https://evil.test/steal' } }) })
    const http = new AppHttp('Tool', ['https://api.tool.test'], { Authorization: 'Bearer secret' }, fn)
    assert.throws(() => http.checked('https://evil.test/x'), /Tool named an address that is not its own/)
    await assert.rejects(() => http.json('https://api.tool.test/next'), /Tool named an address that is not its own/)
    assert.deepEqual(asked.map((a) => a.url), ['https://api.tool.test/next'])
  })

  it('waits out a 429 as Retry-After says, and reads a 401 as the grant refused', async () => {
    let calls = 0
    const { fn } = fakeFetch({
      'https://api.tool.test/busy': () => (++calls === 1 ? json({}, 429, { 'retry-after': '0.2' }) : json({ ok: true })),
      'https://api.tool.test/gone': () => json({}, 401),
    })
    const http = new AppHttp('Tool', ['https://api.tool.test'], {}, fn)
    assert.deepEqual(await http.json('https://api.tool.test/busy'), { ok: true })
    assert.equal(calls, 2)
    await assert.rejects(
      () => http.json('https://api.tool.test/gone'),
      (e: unknown) => e instanceof AppError && e.status === 401 && /Tool refused the grant: sign in to Tool again/.test(e.message),
    )
  })

  it('fetches a file off the tool only from a public address, and never with the grant; one past the limit is none', async () => {
    const { fn, asked } = fakeFetch({
      'https://api.tool.test/file': () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:9/inside' } }),
      'https://api.tool.test/big': () => new Response('x'.repeat(50), { status: 200, headers: { 'content-length': '50' } }),
      'https://api.tool.test/small': () => new Response('hello', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }),
    })
    const http = new AppHttp('Tool', ['https://api.tool.test'], { Authorization: 'Bearer secret' }, fn)
    assert.equal(await http.file('https://api.tool.test/file'), null)
    assert.ok(!asked.some((a) => a.url.includes('127.0.0.1')), 'the private address is never asked')
    assert.equal(await http.file('https://api.tool.test/big', 10), null)
    const small = await http.file('https://api.tool.test/small')
    assert.equal(small?.buffer.toString(), 'hello')
    assert.equal(small?.contentType, 'text/plain')
  })

  it('takes Wrike’s API only on a host of wrike.com', () => {
    const before = process.env.WRIKE_API_URL
    delete process.env.WRIKE_API_URL
    try {
      assert.equal(wrikeApi('app-eu.wrike.com'), 'https://app-eu.wrike.com/api/v4')
      for (const host of ['evil.test', 'wrike.com.evil.test', '127.0.0.1', '', null]) assert.throws(() => wrikeApi(host), /Wrike named an address that is not its own/)
    } finally {
      if (before !== undefined) process.env.WRIKE_API_URL = before
    }
  })
})

describe('the tools’ shapes, as ClickUp maps them', () => {
  it('reads Atlassian’s document format as Markdown', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Plan' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Ship ' }, { type: 'text', text: 'it', marks: [{ type: 'strong' }] }, { type: 'text', text: ' see ' }, { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://d.test' } }] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { text: '@Ana' } }] }] }] },
        { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'run()' }] },
      ],
    }
    assert.equal(adfToMarkdown(doc), '## Plan\n\nShip **it** see [docs](https://d.test)\n\n- one\n- @Ana\n\n```js\nrun()\n```')
    assert.equal(adfToMarkdown('plain v2 text'), 'plain v2 text')
  })

  it('keeps a tool’s statuses in their order, with a closed one added when none closes; a task where its status is, a done one closed', () => {
    const rows = statusRows([{ name: 'Backlog', category: 'open' }, { name: 'Doing', category: 'in_progress' }, { name: 'backlog', category: 'open' }])
    assert.deepEqual(rows.map((r) => `${r.key}:${r.category}:${r.position}`), ['backlog:open:0', 'doing:in_progress:1', 'done:closed:2'])
    assert.equal(placeStatus(rows, 'DOING', false).key, 'doing')
    assert.equal(placeStatus(rows, 'Doing', true).key, 'done')
    assert.equal(placeStatus(rows, null, false).key, 'backlog')
    assert.equal(placeStatus(statusRows(null), null, false).key, 'todo')
    const allClosed = statusRows([{ name: 'Shipped', category: 'closed' }])
    assert.deepEqual(allClosed.map((r) => r.category), ['open', 'closed'])
  })

  it('keeps a value as its field keeps it', () => {
    assert.equal(valueFor('number', '12.5'), 12.5)
    assert.equal(valueFor('number', 'twelve'), null)
    assert.equal(valueFor('checkbox', 'true'), true)
    assert.equal(valueFor('date', '2026-11-03'), '2026-11-03T00:00:00.000Z')
    assert.equal(valueFor('text', '  hi  '), 'hi')
  })

  it('brings an Asana project in as a Folder: its sections the statuses of one List, or Lists of their own', async () => {
    process.env.ASANA_API_URL = 'https://app.asana.test/api/1.0'
    const page = (data: unknown[]) => json({ data, next_page: null })
    const { fn } = fakeFetch({
      'https://app.asana.test/api/1.0/projects/p1/sections': () => page([{ gid: 's1', name: 'Todo' }, { gid: 's2', name: 'Doing' }]),
      'https://app.asana.test/api/1.0/projects/p1/tasks': () =>
        page([
          { gid: 't1', name: 'One', memberships: [{ project: { gid: 'p1' }, section: { gid: 's2' } }], num_subtasks: 1 },
          { gid: 't2', name: 'Two', memberships: [] },
        ]),
      'https://app.asana.test/api/1.0/tasks/t1/subtasks': () => page([{ gid: 't1a', name: 'Sub', num_subtasks: 3 }]),
    })
    globalThis.fetch = fn
    const reader = ASANA.reader({ accessToken: 'tok', account: {} })
    const statuses = (await reader.read('w', { id: 'p1', name: 'Launch' }, { sections: 'statuses' })) as Extract<ImNode, { kind: 'folder' }>
    assert.equal(statuses.kind, 'folder')
    assert.equal(statuses.folder.name, 'Launch')
    assert.deepEqual(statuses.folder.lists.map((l) => l.name), ['Imported from Asana'])
    assert.deepEqual(statuses.folder.lists[0]!.statuses?.map((s) => s.name), ['Todo', 'Doing'])
    assert.deepEqual(statuses.folder.lists[0]!.tasks.map((t) => [t.title, t.status, t.subtasks.map((s) => s.title)]), [['One', 'Doing', ['Sub']], ['Two', null, []]])
    const lists = (await reader.read('w', { id: 'p1', name: 'Launch' }, { sections: 'lists' })) as Extract<ImNode, { kind: 'folder' }>
    assert.deepEqual(lists.folder.lists.map((l) => [l.name, l.tasks.map((t) => t.title)]), [['Todo', []], ['Doing', ['One']], ['Untitled section', ['Two']]])
  })

  it('brings Jira’s epics in as tasks with their issues as subtasks, or as tasks of their own linked; each issue type its own List, or one', async () => {
    process.env.ATLASSIAN_API_URL = 'https://api.atlassian.test'
    const base = 'https://api.atlassian.test/ex/jira/c1/rest/api/3'
    const sc = (name: string, key: string) => ({ name, statusCategory: { key } })
    const epic = { name: 'Epic', subtask: false, hierarchyLevel: 1 }
    const story = { name: 'Story', subtask: false, hierarchyLevel: 0 }
    const sub = { name: 'Sub-task', subtask: true, hierarchyLevel: -1 }
    const { fn } = fakeFetch({
      [`${base}/project/10/statuses`]: () =>
        json([
          { ...epic, statuses: [sc('To Do', 'new'), sc('Done', 'done')] },
          { ...story, statuses: [sc('To Do', 'new'), sc('In Review', 'indeterminate'), sc('Done', 'done')] },
          { ...sub, statuses: [sc('To Do', 'new'), sc('Done', 'done')] },
        ]),
      [`${base}/field`]: () => json([]),
      [`${base}/search/jql`]: () =>
        json({
          issues: [
            { id: '1', key: 'P-1', fields: { summary: 'Epic', issuetype: epic, status: sc('To Do', 'new') } },
            { id: '2', key: 'P-2', fields: { summary: 'Story', issuetype: story, parent: { key: 'P-1' }, status: sc('In Review', 'indeterminate') } },
            { id: '3', key: 'P-3', fields: { summary: 'Sub', issuetype: sub, parent: { key: 'P-2' }, status: sc('Done', 'done') } },
          ],
          isLast: true,
        }),
    })
    globalThis.fetch = fn
    const reader = JIRA.reader({ accessToken: 'tok', account: {} })
    const nested = (await reader.read('c1', { id: '10', name: 'Proj', detail: 'P' }, { lists: 'types', epics: 'subtasks' })) as Extract<ImNode, { kind: 'folder' }>
    const titles = (ts: ImTask[]): unknown[] => ts.map((t) => [t.title, titles(t.subtasks)])
    assert.deepEqual(nested.folder.lists.map((l) => [l.name, titles(l.tasks)]), [['Epic', [['Epic', [['Story', [['Sub', []]]]]]]]])
    assert.deepEqual(nested.folder.lists[0]!.statuses?.map((s) => `${s.name}:${s.category}`), ['To Do:open', 'In Review:in_progress', 'Done:closed'])
    const linked = (await reader.read('c1', { id: '10', name: 'Proj', detail: 'P' }, { lists: 'one', epics: 'linked' })) as Extract<ImNode, { kind: 'folder' }>
    assert.deepEqual(linked.folder.lists.map((l) => [l.name, l.tasks.map((t) => [t.title, t.links, t.subtasks.map((s) => s.title)])]), [['Issues', [['Epic', [], []], ['Story', ['P-1'], ['Sub']]]]])
  })

  it('reads a Notion export: pages nested as Notion nests them, databases every row of their _all file, a row’s page its description', async () => {
    const wiki = `Export/Wiki ${ID(1)}`
    const db = `Export/Tasks ${ID(2)}`
    const inner = await zipOf({
      [`${wiki}.md`]: '# Wiki\n\nHello.\n',
      [`${wiki}/Child ${ID(3)}.md`]: '# Child\n\nUnder the wiki.\n',
      [`${db}.csv`]: 'Name,Status\nOne,Done\n',
      [`${db}_all.csv`]: 'Name,Status\nOne,Done\nTwo,Open\n',
      [`${db}/One ${ID(4)}.md`]: '# One\n\nStatus: Done\n\nThe body of one.\n',
    })
    for (const archive of [inner, await zipOf({ 'Export-Part-1.zip': inner })]) {
      const exp = readNotionExport(archive)
      assert.deepEqual(exp.pages.map((p) => [p.title, p.parent ? exp.pages.find((q) => q.key === p.parent)?.title : null]), [['Wiki', null], ['Child', 'Wiki']])
      assert.equal(exp.databases.length, 1)
      assert.equal(exp.databases[0]!.title, 'Tasks')
      assert.deepEqual(exp.databases[0]!.rows.map((r) => [r.title, r.values.map((v) => `${v.name}=${v.value}`).join(), r.markdown]), [['One', 'Status=Done', 'The body of one.'], ['Two', 'Status=Open', null]])
    }
    assert.throws(() => readNotionExport(Buffer.from('not a zip')), /not a Notion export/)
  })
})
