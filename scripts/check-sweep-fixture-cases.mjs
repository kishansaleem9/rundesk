#!/usr/bin/env node
/*
 * THE SWEEP FIXTURE BUILDS WHERE IT PICKED, ON PLANTED WORKSPACES
 * (`found-25-sep/fixture-builds-in-a-space-it-did-not-check`).
 *
 * `test/e2e/lib/fixture.mjs` is driven here against an in-memory API: a
 * workspace whose FIRST space was left empty by an interrupted run, one whose
 * first project has no list, one with nothing to build in, and an account whose
 * first workspace is an empty shell. `pickWorkspace` and `ensureSweepFixture`
 * must answer each the same way, because they walk the same way.
 * `--mutate` breaks the fixture one rule at a time.
 *
 *   node scripts/check-sweep-fixture-cases.mjs [--mutate]
 */
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SUBJECT = process.env.GATE_UNDER_TEST ?? join(HERE, '..', 'test', 'e2e', 'lib', 'fixture.mjs')
const { pickWorkspace, ensureSweepFixture } = await import(pathToFileURL(SUBJECT).href)

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

/**
 * An API over `world`: { workspaces: [{ id, spaces: [{ id, projects: [{ id, lists: [{ id, tasks }] }] }] }] }.
 * It answers the reads the fixture makes, and records every task it is asked to make.
 */
const apiOver = (world) => {
  const made = []
  const find = (kind, id) => {
    for (const ws of world.workspaces) {
      if (kind === 'ws' && ws.id === id) return ws
      for (const sp of ws.spaces) {
        if (kind === 'space' && sp.id === id) return sp
        for (const pr of sp.projects) {
          if (kind === 'project' && pr.id === id) return pr
          for (const li of pr.lists) if (kind === 'list' && li.id === id) return li
        }
      }
    }
    return null
  }
  const api = async (route, init = {}) => {
    let m
    if (route === '/workspaces') return { data: world.workspaces.map((w) => ({ workspace: { id: w.id } })) }
    if ((m = route.match(/^\/spaces\/workspace\/(.+)$/))) return { data: (find('ws', m[1])?.spaces ?? []).map((s) => ({ id: s.id })) }
    if ((m = route.match(/^\/projects\/space\/(.+)$/))) return { data: (find('space', m[1])?.projects ?? []).map((p) => ({ id: p.id })) }
    if ((m = route.match(/^\/lists\/project\/(.+)$/))) return { data: (find('project', m[1])?.lists ?? []).map((l) => ({ id: l.id })) }
    if ((m = route.match(/^\/tasks\/list\/(.+)$/))) return { data: find('list', m[1])?.tasks ?? [] }
    if ((m = route.match(/^\/lists\/(.+)\/statuses$/))) return { data: [{ key: 'todo' }, { key: 'done' }] }
    if (route.match(/^\/workspaces\/.+\/members$/)) return { data: [] }
    if (route === '/tasks' && init.method === 'POST') { made.push(init.body); return { data: { id: `t${made.length}` } } }
    return { data: null }
  }
  return { api, made }
}
const full = (id, tasks = 6) => ({ id, lists: [{ id: `${id}-list`, tasks: Array.from({ length: tasks }, (_, i) => ({ id: `${id}-t${i}` })) }] })

console.log('\n▶ a leftover empty space does not end a run')
{
  const world = { workspaces: [{ id: 'ws1', spaces: [{ id: 'left-empty', projects: [] }, { id: 'real', projects: [full('p1')] }] }] }
  const { api } = apiOver(world)
  const ws = await pickWorkspace(api)
  const got = await ensureSweepFixture(api, ws.id).catch((e) => ({ error: e.message }))
  chk(ws.id === 'ws1' && got.spaceId === 'real' && got.listId === 'p1-list' && got.created === 0,
    'a first space left empty is passed over: the fixture builds in the space the workspace was picked for',
    `picked ${ws.id}, fixture ${JSON.stringify(got)}`)
}
{
  const world = { workspaces: [{ id: 'ws1', spaces: [{ id: 's1', projects: [{ id: 'no-lists', lists: [] }, full('p2')] }] }] }
  const { api } = apiOver(world)
  const got = await ensureSweepFixture(api, 'ws1').catch((e) => ({ error: e.message }))
  chk(got.projectId === 'p2' && got.listId === 'p2-list', 'a first project with no list is passed over too', JSON.stringify(got))
}
{
  const world = { workspaces: [{ id: 'ws1', spaces: [{ id: 's1', projects: [full('p1', 2)] }] }] }
  const { api, made } = apiOver(world)
  const got = await ensureSweepFixture(api, 'ws1', { minTasks: 6 }).catch((e) => ({ error: e.message }))
  chk(got.created === 4 && made.length === 4 && made.every((b) => b.listId === 'p1-list'), 'a list short of tasks is topped up, in the list found', `${JSON.stringify(got)}, made ${made.length}`)
}

console.log('\n▶ both helpers answer one question one way')
{
  const world = { workspaces: [
    { id: 'shell', spaces: [{ id: 'e1', projects: [] }, { id: 'e2', projects: [{ id: 'pe', lists: [] }] }] },
    { id: 'ws2', spaces: [{ id: 's9', projects: [full('p9')] }] },
  ] }
  const { api } = apiOver(world)
  const ws = await pickWorkspace(api)
  chk(ws.id === 'ws2', 'an empty workspace first is passed over for one with a list', `picked ${ws.id}`)
}
{
  const world = { workspaces: [{ id: 'ws1', spaces: [{ id: 'e1', projects: [{ id: 'pe', lists: [] }] }] }] }
  const { api } = apiOver(world)
  const ws = await pickWorkspace(api)
  const got = await ensureSweepFixture(api, ws.id).then((r) => ({ ok: r }), (e) => ({ error: e.message }))
  chk(ws.id === 'ws1' && /no space of this workspace has a project with a list/.test(got.error ?? ''),
    'a workspace with nothing to build in is said to be so, not built in', JSON.stringify(got))
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.GATE_UNDER_TEST) {
  const alive = (mutant) => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(mutant).href)}); console.log('ok')`], { encoding: 'utf8' })
    return { ok: /ok\b/.test(`${r.stdout ?? ''}`), why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: SUBJECT,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'GATE_UNDER_TEST',
    label: 'the fixture',
    alive,
    mutations: [
      ['first-space-only', '  for (const space of spaces) {\n    const projects', '  for (const space of spaces.slice(0, 1)) {\n    const projects'],
      ['first-project-only', '    for (const project of projects) {\n      const lists = (await api(`/lists/project/${project.id}`)).data ?? []\n      if (lists.length) return { spaceId', '    for (const project of projects.slice(0, 1)) {\n      const lists = (await api(`/lists/project/${project.id}`)).data ?? []\n      if (lists.length) return { spaceId'],
      ['pick-any-workspace', '    if (await firstSweepList(api, ws.id)) return ws\n', '    return ws\n'],
      ['builds-anyway', "  if (!found) throw new Error('no space of this workspace has a project with a list — nothing to build a fixture in')\n", "  if (!found) return { spaceId: null, projectId: null, listId: null, listPath: '', created: 0 }\n"],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
