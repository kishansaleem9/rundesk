import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { canCreateWorkspace } from './workspace-creation-policy'

/** Walk up to the workspace root: this compiles to CJS, so no import.meta. */
function workspaceRoot(from: string): string {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = dirname(dir)
    if (up === dir) throw new Error('workspace root not found')
    dir = up
  }
}

/**
 * §7 — "WORKSPACE IS A FEATURE jo ke har member kar sakta hai" [09:29].
 *
 * The old rule was `user.role !== 'super_admin'` — one line, and the whole of
 * what she called missing at [10:03]. The interesting half of the new rule is
 * not that members can create; it is that the exclusions are exactly two, and
 * that a role invented next year is not silently one of them.
 */
describe('who may create a workspace (§7)', () => {
  it('lets every ordinary role create one — that is the whole point', () => {
    for (const role of ['member', 'manager', 'workspace_admin', 'super_admin']) {
      assert.ok(canCreateWorkspace(role), `${role} should be able to create a workspace`)
    }
  })

  it('does not let a guest', () => {
    // "jo GUEST hai sirf woh create NAHI kar sakta" [09:22].
    assert.equal(canCreateWorkspace('guest'), false)
  })

  it('does not let a viewer, for when there is one', () => {
    /*
     * She names viewer too — "agar koi VIEWER side pe hai to woh bhi nahi"
     * [09:26] — but she is describing ClickUp. Rundesk has no viewer identity:
     * read-only access is a per-container grant, not a kind of person. The name
     * is in the deny-list anyway so that introducing the role later cannot
     * accidentally hand it workspace creation, which is the direction this
     * mistake would go.
     */
    assert.equal(canCreateWorkspace('viewer'), false)
  })

  it('treats a role it has never heard of as allowed, deliberately', () => {
    /*
     * This is the deny-list choice, and it is worth being explicit that it is a
     * choice. An allow-list would mean any role added later arrives unable to
     * create a workspace for no reason anyone decided — and it would read as a
     * permissions bug rather than a missing line in a list. Her rule is phrased
     * the same way: "baaqi sab create kar sakte hain."
     */
    assert.ok(canCreateWorkspace('some_future_role'))
  })

  it('refuses a caller with no role at all', () => {
    // Not a licence: every authenticated caller has one, so this is a malformed
    // token or a row mid-migration.
    for (const role of [null, undefined, '']) {
      assert.equal(canCreateWorkspace(role), false, `${String(role)} should not create`)
    }
  })

  /**
   * §7 — the answers the flow collects have to survive the trip.
   *
   * The global ValidationPipe runs whitelist: true, so a field absent from
   * CreateWorkspaceDto is stripped before the handler ever sees it. That is
   * precisely how §1.1's taskTypeId went missing: the client sent it, the
   * server never received it, and nothing reported a problem — the task simply
   * got the wrong type. Same class had these been added to the body and not the
   * DTO.
   */
  it('declares purpose and comingFrom on the DTO, or they never arrive', () => {
    const dto = readFileSync(
      join(workspaceRoot(process.cwd()), 'apps/api/src/modules/workspaces/dto/create-workspace.dto.ts'),
      'utf8',
    )
    assert.match(dto, /purpose\?: string/, 'purpose is not on the DTO — the pipe will strip it')
    assert.match(dto, /comingFrom\?: string/, 'comingFrom is not on the DTO — the pipe will strip it')
    // And purpose is constrained, since it decides what the workspace starts with.
    assert.match(dto, /IsIn\(\['work', 'personal', 'school'\]\)/, 'purpose accepts anything')
  })

  it('stores both, rather than asking and discarding', () => {
    const svc = readFileSync(
      join(workspaceRoot(process.cwd()), 'apps/api/src/modules/workspaces/workspaces.service.ts'),
      'utf8',
    )
    assert.match(svc, /purpose: dto\.purpose \?\? null/, 'purpose is collected and thrown away')
    assert.match(svc, /comingFrom: dto\.comingFrom \?\? null/, 'comingFrom is collected and thrown away')
  })

  it('gives a new workspace somewhere to land', () => {
    /*
     * A workspace with no space has no project, so no list — and the sidebar,
     * the create modal and every list view have nothing to show. The frame pass
     * flagged exactly that state.
     */
    const svc = readFileSync(
      join(workspaceRoot(process.cwd()), 'apps/api/src/modules/workspaces/workspaces.service.ts'),
      'utf8',
    )
    const create = /async create\([\s\S]*?\n {2}async /.exec(svc)?.[0] ?? ''
    assert.ok(create, 'could not find create')
    for (const table of ['spaces', 'projects', 'lists']) {
      assert.match(create, new RegExp(`insert\\(${table}\\)`), `a new workspace has no ${table}`)
    }
    // And the starter content follows the answer, which is why it was asked.
    assert.match(svc, /STARTER_CONTENT\[dto\.purpose/, 'purpose does not shape what the workspace starts with')
  })

  it('is what the endpoint actually enforces', () => {
    /*
     * The policy being right is worth nothing if the controller still carries
     * its own copy of the old rule. Read at the source rather than constructing
     * a Nest controller: this is the weaker claim and is labelled as one.
     */
    const controller = readFileSync(
      join(workspaceRoot(process.cwd()), 'apps/api/src/modules/workspaces/workspaces.controller.ts'),
      'utf8',
    )
    // Scoped to the create handler. A first version of this asserted the whole
    // file was free of `role !== 'super_admin'` and failed — correctly, on
    // setPlan, which reserves *commercial plan changes* to a super admin and
    // has nothing to do with who may make a workspace. Condemning that would
    // have been the test being wrong, loudly.
    const create = /async create\([\s\S]*?\n {2}\}/.exec(controller)?.[0] ?? ''
    assert.ok(create, 'could not find the create handler')
    assert.match(create, /canCreateWorkspace\(user\.role\)/, 'the endpoint does not use the policy')
    assert.ok(
      !/super_admin/.test(create),
      `the Super-Admin-only check is still in create: ${create.slice(0, 200)}`,
    )
  })
})
