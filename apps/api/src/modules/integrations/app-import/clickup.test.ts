import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClickUpApi, ClickUpReader, channelPlace, chatFiles, cuChatMessage, cuChatText, cuDoc, cuEmoji, cuField, cuGoal, cuKeyResult, cuStatuses, cuTime, cuView, docIn, msDate } from './clickup'
import { mentionToken } from './import-tree'
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

test('a Custom Field comes in by its type: a dropdown by its place or its id, Labels by their names, a People field with no names not at all', () => {
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

/* THE REST OF A WORKSPACE (`found-14-oct/clickup-docs-time-goals-unimported`): its Docs, its tracked time, its Goals. */

test('a People field comes in as its people’s names, a Task or Relationship field as its tasks’, a Formula as its number or its text', () => {
  assert.deepEqual(cuField({ name: 'Owner', type: 'users', value: [{ id: 1, username: 'Ana' }, { id: 2, email: 'ben@x.test' }] }), { name: 'Owner', type: 'text', value: 'Ana, ben@x.test' })
  assert.deepEqual(cuField({ name: 'Blocks', type: 'tasks', value: [{ id: 't1', name: 'Ship it' }] }), { name: 'Blocks', type: 'text', value: 'Ship it' })
  assert.deepEqual(cuField({ name: 'Client', type: 'list_relationship', value: [{ id: 'c1', name: 'Acme' }, { id: 'c2', name: 'Initech' }] }), { name: 'Client', type: 'text', value: 'Acme, Initech' })
  assert.deepEqual(cuField({ name: 'Margin', type: 'formula', value: '12.5' }), { name: 'Margin', type: 'number', value: 12.5 })
  assert.deepEqual(cuField({ name: 'Label', type: 'formula', value: 'late' }), { name: 'Label', type: 'text', value: 'late' })
  assert.equal(cuField({ name: 'Files', type: 'attachment', value: [{ id: 'f' }] }), null)
})

test('a Doc’s first page is the Doc’s own body; its pages, and the Doc’s other pages, nest under it as ClickUp nests them; archived and deleted pages stay behind', () => {
  const doc = cuDoc({ id: 'd1', name: 'Brief' }, [
    { id: 'p1', name: 'Overview', content: '# Why', pages: [{ id: 'p2', name: 'Risks', content: 'Late', pages: [{ id: 'p5', name: 'Deep', content: 'x' }] }, { id: 'p6', name: 'Gone', deleted: true }] },
    { id: 'p3', name: 'Timeline', content: 'October' },
    { id: 'p4', name: 'Old', archived: true },
  ])
  assert.equal(doc.title, 'Brief')
  assert.deepEqual(doc.pages.map((p) => `${p.key}<${p.parent ?? '-'}:${p.title}=${p.markdown}`), [
    'doc:d1<-:Brief=# Why',
    'page:p2<doc:d1:Risks=Late',
    'page:p5<page:p2:Deep=x',
    'page:p3<doc:d1:Timeline=October',
  ])
  assert.deepEqual(cuDoc({ id: 'd2', name: '' }, []).pages, [{ key: 'doc:d2', parent: null, title: 'Untitled', markdown: '' }])
})

test('a Doc is in a Space when it is in it, a Folder of it or a List of it; the Workspace’s own is in none', () => {
  const places = { space: 's1', folders: new Set(['f1']), lists: new Set(['l1']) }
  assert.equal(docIn({ id: 'a', parent: { id: 's1', type: 4 } }, places), true)
  assert.equal(docIn({ id: 'b', parent: { id: 'f1', type: '5' } }, places), true)
  assert.equal(docIn({ id: 'c', parent: { id: 'l1', type: 'LIST' } }, places), true)
  assert.equal(docIn({ id: 'd', parent: { id: 's2', type: 4 } }, places), false)
  assert.equal(docIn({ id: 'e', parent: { id: 't1', type: 12 } }, places), false)
})

test('tracked time is its duration in seconds, billable as it was; a running timer is not time yet', () => {
  const ana = { key: 'clickup:1', name: 'Ana', email: 'ana@x.test' }
  const who = () => ana
  assert.deepEqual(cuTime({ id: 'e1', task: { id: 't' }, user: { id: 1 }, start: '1791280800000', end: '1791288000000', duration: '7200000', billable: true, description: ' Planning ' }, who), {
    person: ana,
    start: new Date(1791280800000),
    end: new Date(1791288000000),
    seconds: 7200,
    billable: true,
    description: 'Planning',
  })
  assert.equal(cuTime({ id: 'e2', user: { id: 1 }, start: '1791280800000', duration: '-1791280800000' }, who), null)
  assert.equal(cuTime({ id: 'e3', user: { id: 1 }, start: '1791280800000', end: null, duration: '600000' }, who)?.end?.getTime(), 1791280800000 + 600000)
})

test('a Target counts from nothing to its target: from its start to its end, down as well as up; true/false as one to do; a Goal’s progress is its Targets’', () => {
  const nobody = () => null
  assert.deepEqual(cuKeyResult({ name: 'Deals', type: 'number', unit: 'deals', steps_start: 0, steps_end: 10, steps_current: 4 }, nobody), { name: 'Deals', unit: 'deals', target: 10, current: 4, done: false, owner: null })
  assert.deepEqual(cuKeyResult({ name: 'Users', type: 'number', steps_start: 50, steps_end: 100, steps_current: 75 }, nobody), { name: 'Users', unit: null, target: 50, current: 25, done: false, owner: null })
  assert.deepEqual(cuKeyResult({ name: 'Churn', type: 'percentage', steps_start: 10, steps_end: 4, steps_current: 7 }, nobody), { name: 'Churn', unit: '%', target: 6, current: 3, done: false, owner: null })
  assert.deepEqual(cuKeyResult({ name: 'Launch', type: 'boolean', completed: true }, nobody), { name: 'Launch', unit: null, target: 1, current: 1, done: true, owner: null })
  assert.equal(cuKeyResult({ name: 'Tasks', type: 'automatic', steps_end: 8, last_action: { steps_current: 8 } }, nobody).done, true)
  const goal = cuGoal({ id: 'g', name: 'Q4', key_results: [{ name: 'a', type: 'number', steps_start: 0, steps_end: 10, steps_current: 4 }, { name: 'b', type: 'boolean', completed: true }] }, nobody)
  assert.equal(goal.percent, 70)
  assert.equal(goal.done, false)
  assert.equal(cuGoal({ id: 'h', name: 'Old', percent_completed: 0.5 }, nobody).percent, 50)
  assert.equal(cuGoal({ id: 'i', name: 'Done', percent_completed: 100 }, nobody).done, true)
})

/** One small Workspace: a Space with a List of two tasks, time on one, three Docs and a Goal. */
function workspace(opts: { refuseOthersTime?: boolean } = {}) {
  return clickup((path, q) => {
    if (path === '/team') return { teams: [{ id: 't1', name: 'Acme', members: [{ user: { id: 1, username: 'Ana', email: 'ana@x.test', role: 1 } }, { user: { id: 2, username: 'Ben', email: 'ben@x.test', role: 3 } }] }] }
    if (path === '/space/s1') return { id: 's1', name: 'Product', statuses: [{ status: 'to do', type: 'open', orderindex: 0 }, { status: 'done', type: 'closed', orderindex: 1 }] }
    if (path === '/space/s1/folder') return { folders: [{ id: 'f1', name: 'Roadmap', lists: [] }] }
    if (path === '/space/s1/list') return { lists: [{ id: 'l1', name: 'Inbox' }] }
    if (path === '/list/l1/task') return { tasks: [{ id: 'k1', name: 'One', status: { status: 'to do', type: 'open' } }, { id: 'k2', name: 'Two', status: { status: 'to do', type: 'open' } }], last_page: true }
    if (path === '/list/l1/view') return { views: [] }
    if (path === '/team/t1/time_entries') {
      if (q.get('assignee') && opts.refuseOthersTime) return undefined
      const own = !q.get('assignee')
      return {
        data: [
          { id: 'e1', task: { id: 'k1' }, user: { id: 1 }, start: '1791280800000', end: '1791288000000', duration: '7200000', billable: true },
          ...(own ? [] : [{ id: 'e2', task: { id: 'k1' }, user: { id: 2 }, start: '1791280800000', duration: '1800000' }]),
          { id: 'e3', task: { id: 'k2' }, user: { id: 1 }, start: '1791280800000', duration: '-1' },
        ],
      }
    }
    if (path === '/api/v3/workspaces/t1/docs')
      return {
        docs: [
          { id: 'd1', name: 'In the Space', parent: { id: 's1', type: 4 } },
          { id: 'd2', name: 'In a Folder', parent: { id: 'f1', type: 5 } },
          { id: 'd3', name: 'The Workspace’s', parent: { id: 't1', type: 12 } },
          { id: 'd4', name: 'Elsewhere', parent: { id: 's9', type: 4 } },
        ],
        next_cursor: null,
      }
    const pages = /^\/api\/v3\/workspaces\/t1\/docs\/(d\d)\/pages$/.exec(path)
    if (pages) return [{ id: `${pages[1]}p`, name: 'Page', content: `body of ${pages[1]}` }]
    if (path === '/team/t1/goal') return { goals: [{ id: 'g1', name: 'Q4' }], folders: [{ goals: [{ id: 'g1', name: 'Q4' }, { id: 'g2', name: 'Old', archived: true }] }] }
    if (path === '/goal/g1') return { goal: { id: 'g1', name: 'Q4', owners: [{ id: 1 }], key_results: [{ name: 'Deals', type: 'number', steps_start: 0, steps_end: 10, steps_current: 5, owners: [{ id: 2 }] }] } }
    return undefined
  })
}

test('a Space’s tracked time comes with its tasks, everyone’s, under whoever tracked it; its Docs are those in it, its Folders and Lists', async () => {
  const { reader, asked } = workspace()
  const node = await reader.read('t1', { id: 's1', name: 'Product' }, { docs: 'spaces', time: 'yes', goals: 'yes' })
  assert.equal(node.kind, 'space')
  if (node.kind !== 'space') return
  const [one, two] = node.lists[0].tasks
  assert.deepEqual(one.time?.map((e) => `${e.person?.email}:${e.seconds}:${e.billable}`), ['ana@x.test:7200:true', 'ben@x.test:1800:false'])
  assert.deepEqual(two.time, [])
  const timeAsk = asked.find((a) => a.startsWith('/team/t1/time_entries?'))!
  assert.ok(timeAsk.includes('assignee=1%2C2') && timeAsk.includes('space_id=s1'), timeAsk)
  assert.deepEqual(node.docs?.map((d) => d.title), ['In the Space', 'In a Folder'])
  assert.ok(asked.some((a) => a.startsWith('/api/v3/workspaces/t1/docs/d1/pages?') && a.includes('content_format=text%2Fmd') && a.includes('max_page_depth=-1')))
  assert.deepEqual(node.errors, [])
})

test('a token that may not read others’ time brings its own, and the run says so; turned off, time and Docs are not asked', async () => {
  const refused = workspace({ refuseOthersTime: true })
  const node = await refused.reader.read('t1', { id: 's1', name: 'Product' }, { docs: 'spaces', time: 'yes' })
  if (node.kind !== 'space') return assert.fail('a Space')
  assert.deepEqual(node.lists[0].tasks[0].time?.map((e) => e.person?.email), ['ana@x.test'])
  assert.match(node.errors?.join() ?? '', /Only a ClickUp Workspace owner’s or admin’s token reads everyone’s tracked time/)
  const off = workspace()
  const quiet = await off.reader.read('t1', { id: 's1', name: 'Product' }, { docs: 'none', time: 'no' })
  if (quiet.kind !== 'space') return assert.fail('a Space')
  assert.equal(off.asked.some((a) => a.includes('time_entries') || a.includes('/docs')), false)
  assert.deepEqual(quiet.docs, [])
})

test('the Workspace’s Goals come once, each read whole for its Targets, an archived one left behind; its own Docs only when asked', async () => {
  const { reader } = workspace()
  const x = await reader.extras('t1', { docs: 'workspace', goals: 'yes' })
  assert.deepEqual(x.goals?.map((g) => `${g.name}:${g.percent}:${g.owner?.email}:${g.keyResults.map((k) => `${k.name}=${k.current}/${k.target}@${k.owner?.email}`).join()}`), ['Q4:50:ana@x.test:Deals=5/10@ben@x.test'])
  assert.deepEqual(x.docs?.map((d) => d.title), ['The Workspace’s'])
  const none = await workspace().reader.extras('t1', { docs: 'spaces', goals: 'no' })
  assert.deepEqual([none.docs, none.goals], [[], []])
})

/* ITS CHAT (`found-14-oct/clickup-chat-unimported`), in the shape ClickUp's v3 Chat API was read in. */

test('a Chat message’s mention of a person is a token for the writer; a group’s is its name; a task’s anchor its words', () => {
  const ana = { key: 'clickup:1', name: 'Ana', email: 'ana@x.test' }
  const who = (id: string) => (id === '1' ? ana : null)
  const said = cuChatText('[@Ana](#user_mention#1) and [@Zed](#user_mention#9), see [@team](#user_group_mention#ab-12) on [Ship it](#task_mention#86x)', who)
  assert.equal(said.text, `${mentionToken(0)} and ${mentionToken(1)}, see @team on Ship it`)
  assert.deepEqual(said.mentions, [{ person: ana, name: 'Ana' }, { person: null, name: 'Zed' }])
})

test('a Chat message is under its author when they are of the Workspace, under ClickUp for its own posts, at its moment', () => {
  const ana = { key: 'clickup:1', name: 'Ana', email: 'ana@x.test' }
  const who = (id: string) => (id === '1' ? ana : null)
  const mine = cuChatMessage({ id: 'm1', content: 'hello', user_id: '1', date: 1791985502627 }, null, who)
  assert.deepEqual([mine.author, mine.authorName, mine.at.getTime(), mine.parent], [ana, 'Ana', 1791985502627, null])
  assert.deepEqual([cuChatMessage({ id: 'm2', content: 'Reminder', user_id: '-1', date: '1791985502627' }, null, who).authorName], ['ClickUp'])
  assert.deepEqual([cuChatMessage({ id: 'm3', content: 'x', user_id: '77', date: 1 }, 'm1', who).authorName], ['ClickUp user 77'])
})

test('Chat is read whole: every page of channels and of messages, each thread’s replies after its first message, oldest first; direct messages turned off are not read', async () => {
  const msgs = (ids: number[]) => ids.map((n) => ({ id: `m${n}`, content: `note ${n}`, user_id: '1', date: 1790000000000 + n * 1000, has_replies: n === 1 }))
  const { reader, asked } = clickup((path, q) => {
    if (path === '/team') return { teams: [{ id: 't1', name: 'Acme', members: [{ user: { id: 1, username: 'Ana', email: 'ana@x.test', role: 1 } }] }] }
    if (path === '/team/t1/goal') return { goals: [] }
    if (path === '/api/v3/workspaces/t1/chat/channels')
      return q.get('cursor') === 'c2'
        ? { data: [{ id: 'dm1', name: 'Ana, Ben', type: 'DM', visibility: 'PRIVATE' }], next_cursor: null }
        : { data: [{ id: 'ch1', name: 'General talk', type: 'CHANNEL', visibility: 'PUBLIC' }, { id: 'ch2', name: 'Leads', type: 'CHANNEL', visibility: 'PRIVATE' }], next_cursor: 'c2' }
    // Newest first, two a page.
    if (path === '/api/v3/workspaces/t1/chat/channels/ch1/messages') return q.get('cursor') === 'p2' ? { data: msgs([1]), next_cursor: null } : { data: msgs([3, 2]), next_cursor: 'p2' }
    if (path === '/api/v3/workspaces/t1/chat/channels/ch2/messages') return { data: [], next_cursor: null }
    if (path === '/api/v3/workspaces/t1/chat/messages/m1/replies') return { data: [{ id: 'r1', content: 'reply', user_id: '1', date: 1790000001500 }], next_cursor: null }
    if (path === '/api/v3/workspaces/t1/chat/channels/ch2/members') return { data: [{ id: 1 }], next_cursor: null }
    return undefined
  })
  const x = await reader.extras('t1', { goals: 'no', dms: 'no' })
  assert.deepEqual(x.chat?.map((c) => `${c.name}:${c.private}:${c.members.map((p) => p.email).join()}`), ['General talk:false:', 'Leads:true:ana@x.test'])
  assert.deepEqual(x.chat?.[0].messages.map((m) => `${m.ref}<${m.parent ?? '-'}`), ['m1<-', 'r1<m1', 'm2<-', 'm3<-'])
  assert.ok(asked.some((a) => a.startsWith('/api/v3/workspaces/t1/chat/channels/ch1/messages?') && a.includes('content_format=text%2Fmd')))
  assert.equal(asked.some((a) => a.includes('/channels/dm1/')), false)
  // Turned off, nothing of Chat is asked.
  const off = clickup((path) => (path === '/team' ? { teams: [{ id: 't1', members: [] }] } : undefined))
  assert.deepEqual((await off.reader.extras('t1', { goals: 'no', chat: 'no' })).chat, [])
  assert.equal(off.asked.some((a) => a.includes('/chat/')), false)
})

test('the rest of Chat (`found-14-oct/clickup-import-rest-unimported`): a direct message between its people, a message’s reactions and files, a Space’s channel by its id', async () => {
  const shot = 'https://t1.p.clickup-attachments.com/t1/u1/shot.png'
  const pdf = 'https://t1.p.clickup-attachments.com/t1/u2/a.pdf?view=open&filename=a.pdf'
  const { reader, asked } = clickup((path) => {
    if (path === '/team') return { teams: [{ id: 't1', name: 'Acme', members: [{ user: { id: 1, username: 'Ana', email: 'ana@x.test', role: 1 } }, { user: { id: 2, username: 'Ben', email: 'ben@x.test', role: 3 } }] }] }
    if (path === '/api/v3/workspaces/t1/chat/channels') return { data: [{ id: '4-s9-8', name: 'Space talk', type: 'CHANNEL', visibility: 'PUBLIC' }, { id: 'dm1', type: 'DM', visibility: 'PRIVATE' }], next_cursor: null }
    if (path === '/api/v3/workspaces/t1/chat/channels/4-s9-8/messages') return { data: [{ id: 'm1', content: `look ![shot.png](${shot})\n[${pdf}](${pdf})`, user_id: '1', date: 1790000000000 }], next_cursor: null }
    if (path === '/api/v3/workspaces/t1/chat/channels/dm1/messages') return { data: [{ id: 'm2', content: 'just us', user_id: '2', date: 1790000001000 }], next_cursor: null }
    if (path === '/api/v3/workspaces/t1/chat/channels/dm1/members') return { data: [{ id: 1 }, { id: 2 }], next_cursor: null }
    if (path === '/api/v3/workspaces/t1/chat/messages/m1/reactions') return { data: [{ reaction: 'thumbsup', user_id: '2' }], next_cursor: null }
    if (path === '/api/v3/workspaces/t1/chat/messages/m2/reactions') return { data: [], next_cursor: null }
    return undefined
  })
  const x = await reader.extras('t1', { goals: 'no' })
  const [talk, dm] = x.chat ?? []
  assert.equal(talk.place, 'space:s9')
  assert.equal(talk.dm, false)
  assert.equal(talk.messages[0].text, 'look')
  assert.deepEqual(talk.messages[0].files?.map((f) => f.name), ['shot.png', 'a.pdf'])
  assert.deepEqual(talk.messages[0].reactions?.map((r) => `${r.person?.email}:${r.emoji}`), ['ben@x.test:👍'])
  assert.equal(dm.dm, true)
  assert.equal(dm.private, true)
  assert.deepEqual(dm.members.map((p) => p.email), ['ana@x.test', 'ben@x.test'])
  assert.ok(asked.includes('/api/v3/workspaces/t1/chat/messages/m1/reactions?limit=100'))
})

test('a file’s link in Chat is a ClickUp file only on its file store; a channel’s place is its parent, else its id; a reaction’s name is its emoji', () => {
  assert.deepEqual(chatFiles('see [the brief](https://elsewhere.test/brief.pdf)'), { text: 'see [the brief](https://elsewhere.test/brief.pdf)', files: [] })
  assert.deepEqual(chatFiles('![x](https://t9.p.clickup-attachments.com/t9/u/x%20y.png)'), { text: '', files: [{ name: 'x', url: 'https://t9.p.clickup-attachments.com/t9/u/x%20y.png' }] })
  assert.deepEqual(chatFiles('[https://t9.p.clickup-attachments.com/t9/u/f.webm?filename=clip.webm](https://t9.p.clickup-attachments.com/t9/u/f.webm?filename=clip.webm)').files[0].name, 'clip.webm')
  assert.equal(channelPlace({ id: '6-123-8' }), 'list:123')
  assert.equal(channelPlace({ id: '5-77-8' }), 'folder:77')
  assert.equal(channelPlace({ id: '8ct13c1-62898' }), null)
  assert.equal(channelPlace({ id: 'x', parent: { id: 9, type: 'SPACE' } }), 'space:9')
  assert.equal(cuEmoji('thumbsup'), '👍')
  assert.equal(cuEmoji('🎉'), '🎉')
  assert.equal(cuEmoji('no_such_name'), ':no_such_name:')
})

test('a List’s view comes in as a view of its kind, grouped and sorted as it was; a Form view has no kind here; a Files field holds its files', () => {
  const ana = { key: 'clickup:1', name: 'Ana', email: 'ana@x.test' }
  assert.deepEqual(cuView({ name: 'Board', type: 'board', pinned: true, visibility: 'public', grouping: { field: 'assignee' }, sorting: { fields: [{ field: 'dateCreated', dir: -1 }] }, creator: 1 }, (id) => (id === '1' ? ana : null)), {
    name: 'Board',
    type: 'board',
    pinned: true,
    private: false,
    protected: false,
    owner: ana,
    groupBy: 'assignee',
    sort: { field: 'created', dir: 'desc' },
  })
  assert.equal(cuView({ name: 'Mine', type: 'list', visibility: 'private' }, () => null)?.private, true)
  assert.equal(cuView({ name: 'Mind', type: 'mind_map' }, () => null)?.type, 'mindmap')
  assert.equal(cuView({ name: 'Intake', type: 'form' }, () => null), null)
  const asked: string[] = []
  const field = cuField({ name: 'Contract', type: 'attachment', value: [{ title: 'c.txt', url: 'https://x.test/c.txt', size: 3 }] }, async (url) => {
    asked.push(url)
    return null
  })
  assert.equal(field?.type, 'files')
  assert.deepEqual(field?.files?.map((f) => f.name), ['c.txt'])
  void field?.files?.[0].fetch()
  assert.deepEqual(asked, ['https://x.test/c.txt'])
  assert.equal(cuField({ name: 'Contract', type: 'attachment', value: [] }, async () => null), null)
})
