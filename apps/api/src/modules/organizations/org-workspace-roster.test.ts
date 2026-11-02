import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
const read = (rel: string) => readFileSync(join(workspaceRoot(process.cwd()), rel), 'utf8')

/**
 * §G08 [08:35–09:57] — an org-admin roster is not a window into every
 * workspace.
 *
 * `listWorkspaces` returned `select()`: every column of every workspace in the
 * organization, to an admin who need not belong to any of them. Among those is
 * `customDomainToken` — the `rundesk-verify=…` secret that proves control of a
 * domain — alongside branding and the `purpose`/`comingFrom` answers somebody
 * gave inside their own workspace.
 *
 * The single caller asks for four fields, so the breadth bought nothing.
 *
 * Asserted as "the projection is explicit", not "these exact columns", because
 * the property that failed is publishing-by-default: a bare `select()` hands
 * this audience whatever the table grows next.
 */
describe('§G08 the org workspace roster is a roster', () => {
  const svc = read('apps/api/src/modules/organizations/organizations.service.ts')

  const body = /async listWorkspaces\(organizationId: string\) \{([\s\S]*?)\n {2}\}/.exec(svc)?.[1] ?? ''

  it('projects explicit columns rather than the whole row', () => {
    assert.ok(body, 'could not find listWorkspaces')
    assert.ok(
      !/\.select\(\)/.test(body),
      'listWorkspaces selects every column again — a new one is published to org admins by default',
    )
    assert.match(body, /\.select\(\{/, 'the projection is no longer explicit')
  })

  it('does not hand out the domain-verification secret', () => {
    assert.ok(
      !/customDomainToken/.test(body),
      'the roster exposes customDomainToken to admins outside the workspace',
    )
  })

  it('still answers what the roster is for', () => {
    for (const field of ['id', 'name', 'slug', 'plan']) {
      assert.match(body, new RegExp(`\\b${field}:`), `the roster no longer returns ${field}`)
    }
  })

  it('leaves the member-facing list filtering by membership', () => {
    /*
     * Her actual claim — "woh meri email pe ban rahi hai", it is mine until I
     * share it — is about what a MEMBER sees, and that path joins through
     * workspace_members. If that ever stops, the privacy she describes is gone
     * regardless of what the admin roster does.
     */
    const ws = read('apps/api/src/modules/workspaces/workspaces.service.ts')
    const listed = /async findByMember\(userId: string\) \{([\s\S]*?)\n {2}\}/.exec(ws)?.[1] ?? ''
    assert.ok(listed, 'could not find findByMember')
    /*
     * Its rows are `membershipsOf`'s, read with each workspace's owner beside
     * them (`found-02-nov/workspace-has-no-owner`): the query is asked there.
     */
    assert.match(listed, /this\.membershipsOf\(userId\)/, `findByMember does not read this member's memberships: ${listed.trim().slice(0, 200)}`)
    const findBy = /private async membershipsOf\(userId: string\) \{([\s\S]*?)\n {2}\}/.exec(ws)?.[1] ?? ''
    assert.ok(findBy, 'could not find membershipsOf')
    /*
     * The WHERE, not the mention.
     *
     * The first version of this asserted that `workspaceMembers` appeared
     * somewhere in the method — and it still does, in `.from()` and
     * `.innerJoin()`, with the user filter deleted. It passed on a version that
     * returned every workspace in the system to everybody. What has to hold is
     * that the query is constrained to THIS user.
     */
    assert.match(
      findBy,
      /eq\(workspaceMembers\.userId,\s*userId\)/,
      `a member’s workspace list is not filtered to them: ${findBy.trim().slice(0, 200)}`,
    )
  })
})
