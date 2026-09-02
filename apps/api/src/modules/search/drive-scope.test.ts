import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DRIVE_SEARCH_SCOPE, grantCoversWholeDrive } from './drive-scope'

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
 * §G03 [04:04–04:32] — the scope we ask for has to answer the query we send.
 *
 * These were maintained independently and disagreed: the OAuth grant requested
 * `drive.file` — files this app created or the user picked by hand — while the
 * search issued an account-wide `name contains '…'`. Drive answered "nothing",
 * every time, with no error. An empty section reads as "no matching files",
 * which is a lie about somebody's Drive.
 *
 * Two halves that must agree, in two different modules, is exactly the shape
 * that drifts. So this asserts they agree rather than that either one is a
 * particular string.
 */
describe('§G03 the Drive grant can answer the Drive query', () => {
  const connections = read(
    'apps/api/src/modules/integrations/connections/integration-connections.service.ts',
  )
  const search = read('apps/api/src/modules/search/search.service.ts')

  it('asks for the scope from the shared constant, not a literal', () => {
    // A literal here is how the two drifted the first time.
    assert.match(connections, /DRIVE_SEARCH_SCOPE/, 'the OAuth scope list no longer uses the constant')
    assert.ok(
      !/auth\/drive\.file/.test(connections),
      'the connection still requests drive.file, which cannot see a user’s own Drive',
    )
  })

  it('issues an account-wide query, which is what that scope is for', () => {
    const q = /q: `([^`]*)`/.exec(search)?.[1] ?? ''
    assert.ok(q, 'could not find the Drive query')
    assert.match(q, /name contains/, 'the Drive query no longer searches by name')
    // If the query is ever narrowed to app-created files, the broad consent is
    // no longer justified and this should be revisited deliberately.
    assert.ok(
      !/appDataFolder|'me' in owners/.test(q),
      `the query was narrowed (${q}) — the broad scope is no longer warranted`,
    )
  })

  it('refuses to send an account-wide query on a grant that cannot answer it', () => {
    assert.match(
      search,
      /grantCoversWholeDrive\(conn\.scopes\)/,
      'search no longer checks the stored grant, so an old connection silently returns nothing',
    )
  })

  it('recognises the grant it asks for, and nothing less', () => {
    assert.equal(grantCoversWholeDrive([DRIVE_SEARCH_SCOPE]), true)
    assert.equal(grantCoversWholeDrive(['https://www.googleapis.com/auth/drive.file']), false)
    assert.equal(grantCoversWholeDrive([]), false)
    assert.equal(grantCoversWholeDrive(null), false)
    assert.equal(grantCoversWholeDrive(undefined), false)
  })
})
