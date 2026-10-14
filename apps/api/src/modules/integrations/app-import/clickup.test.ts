import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClickUpApi, ClickUpReader, cuField, cuStatuses, msDate } from './clickup'
import { inviteAs } from './app-import.service'
import { roleRank } from '../../../common/permissions/workspace-roles'

/*
 * A CLICKUP WORKSPACE, IMPORTED WHOLE (`found-14-oct/clickup-workspace-import-and-people-unbuilt`): what the
 * reader makes of ClickUp's answers, without a network — ClickUp's API answered by a function.
 */

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

/** ClickUp's API, as a function of the path and query it is asked. */
function clickup(routes: (path: string, q: URLSearchParams) => unknown) {
  const asked: string[] = []
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input))
    asked.push(`${url.pathname.replace('/api/v2', '')}${url.search}`)
    const body = routes(url.pathname.replace('/api/v2', ''), url.searchParams)
    return body === undefined ? new Response('{}', { status: 404 }) : json(body)
  }) as typeof fetch
  return { reader: new ClickUpReader(new ClickUpApi('pk_test', fetchImpl)), asked }
}

test('a Custom Field comes in by its type: a dropdown by its place or its id, Labels by their names, a People field not at all', () => {
  const options = [{ id: 'o1', name: 'Idea', orderindex: 0 }, { id: 'o2', name: 'Build', orderindex: 1 }]
  assert.deepEqual(cuField({ name: 'Stage', type: 'drop_down', type_config: { options }, value: 1 }), { name: 'Stage', type: 'dropdown', value: 'Build', options: ['Idea', 'Build'] })
  assert.deepEqual(cuField({ name: 'Stage', type: 'drop_down', type_config: { options }, value: 'o1' }), { name: 'Stage', type: 'dropdown', value: 'Idea', options: ['Idea', 'Build'] })
  assert.equal(cuField({ name: 'Stage', type: 'drop_down', type_config: { options }, value: 7 }), null)
  assert.deepEqual(cuField({ name: 'Areas', type: 'labels', type_config: { options: [{ id: 'a1', label: 'Web' }, { id: 'a2', label: 'Mobile' }] }, value: ['a2', 'a1'] }), { name: 'Areas', type: 'text', value: 'Mobile, Web' })
  assert.deepEqual(cuField({ name: 'Budget', type: 'currency', value: '1200.5' }), { name: 'Budget', type: 'number', value: 1200.5 })
  assert.deepEqual(cuField({ name: 'Done?', type: 'checkbox', value: 'true' }), { name: 'Done?', type: 'checkbox', value: true })
  assert.deepEqual(cuField({ name: 'Kickoff', type: 'date', value: '1790899200000' }), { name: 'Kickoff', type: 'date', value: '2026-10-02T00:00:00.000Z' })
  assert.deepEqual(cuField({ name: 'Where', type: 'location', value: { formatted_address: 'Lahore' } }), { name: 'Where', type: 'text', value: 'Lahore' })
  assert.equal(cuField({ name: 'Owner', type: 'users', value: [{ id: 1 }] }), null)
  assert.equal(cuField({ name: 'Empty', type: 'text' }), null)
})

test('statuses come in ClickUp’s order, open first and closed last, each once', () => {
  const s = cuStatuses([
    { status: 'complete', type: 'closed', orderindex: 3 },
    { status: 'to do', type: 'open', orderindex: 0 },
    { status: 'shipped', type: 'done', orderindex: 2 },
    { status: 'in progress', type: 'custom', orderindex: 1 },
    { status: 'In Progress', type: 'custom', orderindex: 4 },
  ])
  assert.deepEqual(s, [
    { name: 'to do', category: 'open' },
    { name: 'in progress', category: 'in_progress' },
    { name: 'shipped', category: 'closed' },
    { name: 'complete', category: 'closed' },
  ])
})

test('a ClickUp moment is milliseconds since 1970, as a string or a number', () => {
  assert.equal(msDate('1790899200000')?.toISOString(), '2026-10-02T00:00:00.000Z')
  assert.equal(msDate(1790899200000)?.toISOString(), '2026-10-02T00:00:00.000Z')
  assert.equal(msDate(null), null)
  assert.equal(msDate('soon'), null)
  assert.equal(msDate('0'), null)
})

test('somebody is invited as ClickUp has them, never above the inviter', () => {
  assert.equal(inviteAs('admin', roleRank('workspace_admin')), 'workspace_admin')
  assert.equal(inviteAs('guest', roleRank('workspace_admin')), 'guest')
  assert.equal(inviteAs(undefined, roleRank('workspace_admin')), 'member')
  // A manager invites no admin: ClickUp's admin comes as a member.
  assert.equal(inviteAs('admin', roleRank('manager')), 'member')
  assert.equal(inviteAs('member', roleRank('guest')), null)
})

test('a Space is read whole: every page of a List’s tasks, closed ones and subtasks asked for; a subtask under its task, its own one level up; a List’s own statuses from its page', async () => {
  const tasks = [
    { id: 't1', name: 'Plan', status: { status: 'in progress', type: 'custom' }, time_estimate: 5400000, priority: { id: '2', priority: 'high' }, assignees: [{ id: 7, username: 'Ana', email: 'ANA@x.test' }] },
    { id: 't2', name: 'Copy', parent: 't1', status: { status: 'to do', type: 'open' } },
    { id: 't3', name: 'Headline', parent: 't2', status: { status: 'to do', type: 'open' } },
    { id: 't4', name: 'Kit', status: { status: 'complete', type: 'closed' }, date_closed: '1790899200000', dependencies: [{ task_id: 't4', depends_on: 't1' }] },
    { id: 't5', name: 'Gone', archived: true, status: { status: 'to do', type: 'open' } },
  ]
  const { reader, asked } = clickup((path, q) => {
    if (path === '/team') return { teams: [{ id: 'w1', name: 'Acme', members: [{ user: { id: 7, username: 'Ana', email: 'ana@x.test', role: 3 } }, { user: { id: 8, username: 'Gil', email: 'gil@x.test', role: 4 } }] }] }
    if (path === '/space/s1') return { id: 's1', name: 'Product', statuses: [{ status: 'to do', type: 'open', orderindex: 0 }, { status: 'complete', type: 'closed', orderindex: 9 }] }
    if (path === '/space/s1/folder') return { folders: [{ id: 'f1', name: 'Roadmap', lists: [{ id: 'l1', name: 'Q4', override_statuses: true }] }, { id: 'f2', name: 'Hidden', hidden: true, lists: [] }] }
    if (path === '/space/s1/list') return { lists: [] }
    if (path === '/list/l1') return { id: 'l1', statuses: [{ status: 'to do', type: 'open', orderindex: 0 }, { status: 'in progress', type: 'custom', orderindex: 1 }, { status: 'complete', type: 'closed', orderindex: 2 }] }
    if (path === '/list/l1/task') {
      const page = Number(q.get('page'))
      return { tasks: tasks.slice(page * 2, page * 2 + 2), last_page: page * 2 + 2 >= tasks.length }
    }
    return undefined
  })
  const node = await reader.read('w1', { id: 's1', name: 'Product' })
  assert.equal(node.kind, 'space')
  if (node.kind !== 'space') return
  assert.equal(node.name, 'Product')
  assert.deepEqual(node.folders.map((f) => f.name), ['Roadmap'])
  const q4 = node.folders[0].lists[0]
  assert.deepEqual(q4.statuses?.map((s) => s.name), ['to do', 'in progress', 'complete'])
  assert.deepEqual(q4.tasks.map((t) => t.title), ['Plan', 'Kit'])
  const plan = q4.tasks[0]
  assert.deepEqual(plan.subtasks.map((t) => t.title), ['Copy'])
  assert.deepEqual(plan.subtasks[0].subtasks.map((t) => t.title), ['Headline'])
  assert.equal(plan.estimateSeconds, 5400)
  assert.equal(plan.priority, 'high')
  assert.deepEqual(plan.assignees.map((p) => [p.key, p.email, p.role]), [['clickup:7', 'ana@x.test', 'member']])
  assert.equal(q4.tasks[1].done, true)
  assert.equal(q4.tasks[1].doneAt?.toISOString(), '2026-10-02T00:00:00.000Z')
  assert.deepEqual(q4.tasks[1].links, ['t1'])
  const pages = asked.filter((a) => a.startsWith('/list/l1/task?'))
  assert.equal(pages.length, 3)
  assert.ok(pages.every((a) => a.includes('include_closed=true') && a.includes('subtasks=true')))
})

test('every comment is read, oldest first: ClickUp’s pages of 25, newest first, each asked from the oldest of the one before', async () => {
  const all = Array.from({ length: 27 }, (_, n) => ({ id: `c${n + 1}`, comment_text: `Note ${n + 1}`, user: { id: 7, username: 'Ana', email: 'ana@x.test' }, date: String(1790000000000 + n * 60000) }))
  const newestFirst = [...all].reverse()
  const { reader, asked } = clickup((path, q) => {
    if (path === '/team') return { teams: [{ id: 'w1', name: 'Acme', members: [] }] }
    if (path === '/space/s1') return { id: 's1', name: 'P', statuses: [] }
    if (path === '/space/s1/folder') return { folders: [] }
    if (path === '/space/s1/list') return { lists: [{ id: 'l1', name: 'L' }] }
    if (path === '/list/l1/task') return { tasks: [{ id: 't1', name: 'One', attachments: [] }], last_page: true }
    if (path === '/task/t1/comment') {
      const from = q.get('start_id') ? newestFirst.findIndex((c) => c.id === q.get('start_id')) + 1 : 0
      return { comments: newestFirst.slice(from, from + 25) }
    }
    return undefined
  })
  const node = await reader.read('w1', { id: 's1', name: 'P' })
  assert.equal(node.kind, 'space')
  if (node.kind !== 'space') return
  const details = await node.lists[0].tasks[0].details!()
  assert.equal(details.comments.length, 27)
  assert.equal(details.comments[0].text, 'Note 1')
  assert.equal(details.comments[26].text, 'Note 27')
  assert.ok(asked.some((a) => a.startsWith('/task/t1/comment?') && a.includes('start_id=c3')))
  // Its files were on the page of tasks, so the task's own page was not asked.
  assert.ok(!asked.includes('/task/t1'))
})

test('a Workspace the token does not open is said, not read', async () => {
  const { reader } = clickup((path) => (path === '/team' ? { teams: [{ id: 'w1', name: 'Acme', members: [] }] } : undefined))
  await assert.rejects(() => reader.projects('w2'), /not one this token opens/)
})
