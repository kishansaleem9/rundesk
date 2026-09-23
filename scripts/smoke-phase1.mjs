#!/usr/bin/env node
import { bail } from './lib/bail.mjs'
// End-to-end smoke test for Phase 1 surface area.
// Hits real HTTP endpoints; bails at first failing assertion.

const BASE = process.env.API_URL ?? 'http://localhost:3001/api/v1'

function log(step, ...rest) { console.log(`\x1b[36m[smoke]\x1b[0m ${step}`, ...rest) }
function ok(step)            { console.log(`\x1b[32m[ ok  ]\x1b[0m ${step}`) }
// Awaited at every call, so a failure stops the smoke there with its output
// intact — `process.exit()` dropped what a slow pipe had not read yet.
async function fail(step, detail) { console.error(`\x1b[31m[fail ]\x1b[0m ${step}`, detail); await bail(1) }

async function j(res) {
  const text = await res.text()
  try { return { body: JSON.parse(text), status: res.status } }
  catch { return { body: text, status: res.status } }
}

async function call(method, path, { token, body } = {}) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const { body: b, status } = await j(res)
  if (!res.ok) await fail(`${method} ${path}`, `status=${status} body=${JSON.stringify(b)}`)
  return b?.data ?? b
}

async function main() {
  log('login as admin')
  const login = await call('POST', '/auth/login', {
    body: { email: 'admin@rundesk.internal', password: 'Admin@123!' },
  })
  const token = login.accessToken
  const workspaceId = login.workspaces?.[0]?.id
  if (!token || !workspaceId) await fail('login', JSON.stringify(login))
  ok(`logged in, workspace=${workspaceId}`)

  log('get spaces')
  const spaces = await call('GET', `/spaces/workspace/${workspaceId}`, { token })
  const spaceId = spaces[0]?.id
  ok(`${spaces.length} spaces`)

  log('get projects')
  const projects = await call('GET', `/projects/space/${spaceId}`, { token })
  const projectId = projects[0]?.id
  ok(`${projects.length} projects`)

  log('get lists')
  const lists = await call('GET', `/lists/project/${projectId}`, { token })
  const listId = lists[0]?.id
  ok(`${lists.length} lists`)

  log('get tasks in list')
  const tasks = await call('GET', `/tasks/list/${listId}`, { token })
  if (!Array.isArray(tasks) || tasks.length === 0) await fail('tasks empty')
  ok(`${tasks.length} tasks, first has ${tasks[0].labels?.length ?? 0} labels, ${tasks[0].assignees?.length ?? 0} assignees`)

  log('get workspace labels')
  const labels = await call('GET', `/workspaces/${workspaceId}/labels`, { token })
  if (!labels.length) await fail('no labels')
  ok(`${labels.length} labels`)

  log('get saved views')
  const views = await call('GET', `/lists/${listId}/views`, { token })
  ok(`${views.length} views (${views.map(v => v.type).join(', ')})`)

  log('get docs')
  const docs = await call('GET', `/workspaces/${workspaceId}/docs`, { token })
  ok(`${docs.length} docs`)

  log('create a parent task')
  const parent = await call('POST', '/tasks', {
    token,
    body: { listId, title: 'Phase 1 smoke parent', priority: 'high', status: 'todo' },
  })
  ok(`parent task ${parent.id}`)

  log('create a subtask')
  const subtask = await call('POST', '/tasks', {
    token,
    body: { listId, title: 'Phase 1 subtask', parentTaskId: parent.id },
  })
  ok(`subtask ${subtask.id}`)

  log('add a label to parent')
  const withLabel = await call('POST', `/tasks/${parent.id}/labels/${labels[0].id}`, { token })
  if (!withLabel.labels?.some(l => l.id === labels[0].id)) await fail('label not attached')
  ok('label attached')

  log('update parent task status -> in_progress')
  await call('PATCH', `/tasks/${parent.id}`, { token, body: { status: 'in_progress' } })
  ok('status changed')

  log('add a comment')
  const comment = await call('POST', `/tasks/${parent.id}/comments`, {
    token,
    body: { body: 'Looks good from me 👍' },
  })
  ok(`comment ${comment.id}`)

  log('create checklist + item + toggle')
  const checklist = await call('POST', `/tasks/${parent.id}/checklists`, { token, body: { title: 'DoD' } })
  const item = await call('POST', `/tasks/${parent.id}/checklists/${checklist.id}/items`, {
    token, body: { content: 'Tests pass' },
  })
  await call('PATCH', `/tasks/${parent.id}/checklists/items/${item.id}`, { token, body: { isDone: true } })
  ok('checklist + item toggled done')

  log('start + stop timer')
  const timer = await call('POST', `/tasks/${parent.id}/time-entries/start`, { token, body: { description: 'Smoke run' } })
  await new Promise((r) => setTimeout(r, 1200))
  const stopped = await call('POST', `/tasks/${parent.id}/time-entries/stop/${timer.id}`, { token })
  if (!stopped.durationSec || stopped.durationSec < 1) await fail('timer duration', JSON.stringify(stopped))
  ok(`timer ran ${stopped.durationSec}s`)

  log('add dependency subtask -> parent')
  await call('POST', `/tasks/${subtask.id}/dependencies`, {
    token, body: { relatedTaskId: parent.id, type: 'blocked_by' },
  })
  ok('dependency added')

  log('fetch hydrated parent task')
  const hydrated = await call('GET', `/tasks/${parent.id}`, { token })
  const hasComment = Array.isArray((await call('GET', `/tasks/${parent.id}/comments`, { token }))) || true
  const activity = await call('GET', `/tasks/${parent.id}/activity`, { token })
  ok(`hydrated: ${hydrated.checklists?.length ?? 0} checklists, ${hydrated.watchers?.length ?? 0} watchers, ${activity.length} activity entries`)

  log('create doc + update it')
  const newDoc = await call('POST', `/workspaces/${workspaceId}/docs`, {
    token, body: { title: 'Smoke Doc', spaceId },
  })
  await call('PATCH', `/docs/${newDoc.id}`, {
    token,
    body: {
      title: 'Smoke Doc - Updated',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello rundesk' }] }],
      },
    },
  })
  ok(`doc ${newDoc.id} updated`)

  log('search')
  await new Promise((r) => setTimeout(r, 300))
  const hits = await call('GET', `/search/${workspaceId}?q=smoke`, { token })
  ok(`search returned ${hits.length} results`)

  log('notifications unread count')
  const { count } = await call('GET', '/notifications/unread-count', { token })
  ok(`${count} unread`)

  log('cleanup: delete the smoke tasks + doc')
  await call('DELETE', `/tasks/${parent.id}`, { token })
  await call('DELETE', `/docs/${newDoc.id}`, { token })
  ok('cleanup done')

  console.log('\n\x1b[32m✅  Phase 1 smoke passed\x1b[0m')
}

main().catch(async (err) => {
  console.error(err)
  await bail(1)
})
