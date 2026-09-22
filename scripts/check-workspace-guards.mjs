#!/usr/bin/env node
/*
 * A WRITE THAT LANDS IN THE WRONG WORKSPACE SUCCEEDS, which is why this exists.
 *
 * `POST /workspaces/:id/docs/import` shipped carrying only `JwtAuthGuard` and
 * the DOCS feature flag. Those prove WHO you are and that Docs are enabled for
 * you; neither says you belong to the workspace named in the path. Any
 * authenticated user could have imported a doc into any workspace by id.
 *
 * It was found by reading the sibling route, not by any test, and that is the
 * whole argument for a checker. The importer was green in twenty-nine cases —
 * the parser round trips, the title is right, the doc is created — while
 * writing into somebody else's workspace. There is no error, no failing check
 * and no log line, because the write SUCCEEDS. Every test was about the
 * content, and none of them could have seen where it landed.
 *
 * WHAT THIS ASKS: for every write route whose PATH names a `:workspaceId`, is
 * there anything that proves the caller belongs to that workspace?
 *
 * WHAT IT CANNOT SEE, and the reason for the list below. Fourteen routes in
 * this tree are protected in their SERVICE instead — `assertMember`,
 * `assertAdmin`, `assertWorkspaceRole` — or by a role check written into the
 * handler. `MeetingsController` says in its own header why: its routes address
 * a workspace by id AND a meeting by id, "so no single guard covers both
 * shapes". That is a legitimate design and a text scan cannot follow it.
 *
 * So the fourteen are listed by name, each one READ before it went in, and the
 * check is that the set has not GROWN. A fifteenth is a new route that nothing
 * obvious protects — which may be fine, and must be looked at and written down
 * here rather than discovered the way this one was.
 *
 * THE LIST IS EVIDENCE, NOT AN EXCUSE. Adding a line to it without reading the
 * service is how this check becomes decoration.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bail } from './lib/bail.mjs'

const ROOT = process.env.GUARD_SCAN_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '../apps/api/src')

/*
 * Every guard in this tree that establishes the caller's standing in the
 * workspace. `ResourceMemberGuard` resolves the workspace from whichever of
 * workspaceId / spaceId / listId the route carries and then checks
 * `workspaceMembers`; `PermissionsGuard` reads `req.workspaceMember`, so it
 * only runs behind one of the others. Leaving `ResourceMemberGuard` out of
 * this list reported the whole of `SearchController` as unguarded.
 */
const GUARDS =
  /ResourceMemberGuard|PermissionsGuard|WorkspaceMemberGuard|WorkspaceAdminGuard|OrganizationAdminGuard|OrganizationMemberGuard/

/*
 * READ BY READING, one at a time, on the day this went in. Each is protected
 * somewhere a text scan cannot follow — the service or the handler — and the
 * note says where, so the next person re-checks instead of trusting the list.
 */
const VERIFIED = new Map([
  ['modules/chat/chat.controller.ts:chat/workspaces/:workspaceId/custom-emoji/presign', 'ChatService.createCustomEmojiUploadUrl → assertWorkspaceRole'],
  ['modules/chat/chat.controller.ts:chat/workspaces/:workspaceId/custom-emoji', 'ChatService.addCustomEmoji → assertWorkspaceRole'],
  ['modules/meetings/meetings.controller.ts:workspaces/:workspaceId/meetings', 'MeetingsService.create → assertMember'],
  ['modules/meetings/meetings.controller.ts:workspaces/:workspaceId/meetings/ask', 'MeetingsService.ask → recentForAi → assertMember'],
  ['modules/meetings/meetings.controller.ts:workspaces/:workspaceId/meetings/:meetingId', 'MeetingsService.update / remove → assertMember'],
  ['modules/meetings/meetings.controller.ts:workspaces/:workspaceId/meetings/:meetingId/attendees', 'MeetingsService.addAttendee → assertMember'],
  ['modules/meetings/meetings.controller.ts:workspaces/:workspaceId/meetings/:meetingId/attendees/:attendeeId', 'MeetingsService.removeAttendee → assertMember'],
  ['modules/meetings/meetings.controller.ts:workspaces/:workspaceId/meetings/:meetingId/action-items', 'MeetingsService.extractActionItems → assertMember'],
  ['modules/tasks/checklist-templates.controller.ts:workspaces/:workspaceId/checklist-templates', 'ChecklistTemplatesService.create → assertMember'],
  ['modules/tasks/task-types.controller.ts:workspaces/:workspaceId/task-types', 'TaskTypesService.create → assertAdmin'],
  ['modules/tasks/task-types.controller.ts:workspaces/:workspaceId/task-types/:typeId', 'TaskTypesService.update / remove → assertAdmin'],
  ['modules/workspaces/workspaces.controller.ts::workspaceId/plan', 'handler refuses unless user.role === super_admin — stricter than a member guard'],
])

const files = []
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.controller\.ts$/.test(p)) files.push(p)
  }
}
walk(ROOT)

let routes = 0
const bare = []
for (const f of files.sort()) {
  const lines = readFileSync(f, 'utf8').split('\n')

  // Class-level guards cover every route in the class.
  const classes = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^export class /.test(lines[i])) continue
    let j = i - 1
    let head = ''
    while (j >= 0 && /^[@\s/*]/.test(lines[j])) head = `${lines[j--]}\n${head}`
    classes.push({ at: i, guarded: GUARDS.test(head) })
  }

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/@(Post|Patch|Put|Delete)\(\s*'([^']*:workspaceId[^']*)'/)
    if (!m) continue
    routes += 1
    /*
     * THE WHOLE DECORATOR BLOCK, above the verb AND below it. Decorator order
     * is not fixed here: the integrations disconnect route carries
     * `@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, WorkspaceAdminGuard,
     * PermissionsGuard)` ABOVE its `@Delete`, and a first version of this scan
     * looked only below and called it unguarded. Four guards and a permission,
     * reported as bare.
     */
    let a = i
    while (a > 0 && /^\s*[@)]|^\s*'|^\s*\w+:/.test(lines[a - 1])) a -= 1
    let b = i
    while (b < lines.length && !/^\s*(async\s+)?[A-Za-z_$][\w$]*\s*\(/.test(lines[b])) b += 1
    const block = lines.slice(a, b + 1).join('\n')
    const cls = classes.filter((c) => c.at < i).pop()
    if (GUARDS.test(block) || cls?.guarded) continue
    bare.push({ key: `${f.slice(f.indexOf('modules/'))}:${m[2]}`, at: `${f.replace(/^.*\/apps\//, 'apps/')}:${i + 1}`, verb: m[1], path: m[2] })
  }
}

// A denominator, because "0 unguarded" over 0 routes is the shape this audit
// keeps finding: a scan that read nothing reports the same zero as a clean one.
const MIN_ROUTES = Number(process.env.GUARD_MIN_ROUTES ?? (process.env.GUARD_SCAN_ROOT ? 1 : 40))
if (routes < MIN_ROUTES) {
  console.error(
    `\n[workspace-guards] only ${routes} write route(s) naming a :workspaceId were found under ${ROOT}, ` +
      `below the floor of ${MIN_ROUTES}.\nThe verdict below is a zero, so a scan that reads nothing passes — ` +
      'point this at the controllers rather than lowering the floor.',
  )
  bail(1)
}

const novel = bare.filter((b) => !VERIFIED.has(b.key))
/*
 * Routes, not entries. One VERIFIED key can cover two routes — a Patch and a
 * Delete on the same path — so `14 of 12` was the first thing this printed and
 * it reads as a bug in the checker rather than as two verbs sharing a path.
 */
console.log(
  `[workspace-guards] ${routes} write route(s) name a :workspaceId · ${bare.length} carry no guard, ` +
    `all of them covered by ${VERIFIED.size} verified-by-reading entr${VERIFIED.size === 1 ? 'y' : 'ies'} · ` +
    `${novel.length} unaccounted for`,
)

if (novel.length) {
  console.error('\n[workspace-guards] these carry no workspace guard and are not on the verified list:\n')
  for (const n of novel) console.error(`    ${n.at}  ${n.verb} ${n.path}`)
  console.error(
    '\n  Either give the route a guard — `@UseGuards(WorkspaceMemberGuard)`, as its siblings have —\n' +
      '  or READ the service, confirm it asserts membership, and add it to VERIFIED with a note\n' +
      '  saying where. A write that lands in the wrong workspace SUCCEEDS: there is no error to\n' +
      '  notice, so this list is the only thing standing between a new route and a silent one.',
  )
  bail(1)
}

// A route that was verified and has since GAINED a guard is good news, but the
// stale entry should go: a list nobody prunes is a list nobody reads.
const gone = [...VERIFIED.keys()].filter((k) => !bare.some((b) => b.key === k))
if (gone.length) {
  console.log(`\n[workspace-guards] ${gone.length} verified route(s) now carry a guard — drop them from VERIFIED:`)
  for (const g of gone) console.log(`    ${g}`)
}
