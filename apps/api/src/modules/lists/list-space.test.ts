import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
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
const ROOT = workspaceRoot(process.cwd())
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * §G15 [21:49–21:54] — "pehle space hoti hai. Iske baad LIST aati hai."
 *
 * She narrates the hierarchy as two levels and creates a List by choosing a
 * Space. Ours forces a Project between them, and a list had no way to name its
 * space at all: `lists` referenced only `project_id`, so "which space?" was two
 * joins and a list without a project would be an orphan.
 *
 * Migration 0124 gives every list a direct `space_id`; 0125 keeps it true with
 * a trigger. This is the additive half — `project_id` is still required — and
 * these checks exist so the groundwork cannot quietly rot before the rest
 * lands.
 */
describe('§G15 a list knows its own space', () => {
  const schema = read('packages/db/src/schema/lists.ts')
  const migrations = join(ROOT, 'packages/db/src/migrations')
  const files = readdirSync(migrations).filter((f) => f.endsWith('.sql'))
  /*
   * Comments stripped before matching.
   *
   * The first version searched the raw file, so commenting the whole statement
   * out — `-- CREATE TRIGGER …` — still matched and the check passed on a
   * migration that creates nothing. What is being asserted is that the
   * statement RUNS, not that the words are present in the file.
   */
  const sql = (text: string) => text.replace(/--[^\n]*/g, '')
  const trigger = sql(
    read(`packages/db/src/migrations/${files.find((f) => f.includes('lists_space_stays_true'))}`),
  )
  const add = sql(
    read(`packages/db/src/migrations/${files.find((f) => f.includes('lists_know_their_space'))}`),
  )

  it('the column exists on the schema, with its relation', () => {
    assert.match(schema, /spaceId:\s*uuid\('space_id'\)/, 'lists has no space_id')
    assert.match(schema, /space: one\(spaces/, 'lists has no space relation')
  })

  it('the backfill takes the space from the owning project', () => {
    // The only place the value could come from, and the definition of correct.
    assert.match(add, /UPDATE "lists"/i)
    assert.match(add, /p\."space_id"/, 'the backfill does not read the project’s space')
  })

  it('a trigger keeps it true, rather than five call sites remembering', () => {
    /*
     * Five services insert a list today and a list can be MOVED between
     * projects. Patching call sites fixes the ones that exist and rots the
     * column the day a sixth appears — including raw SQL, seeds and importers
     * that never touch the service layer. Derived where it cannot be bypassed.
     */
    assert.match(trigger, /CREATE TRIGGER trg_lists_space_from_project/, 'the trigger is gone')
    assert.match(
      trigger,
      /BEFORE INSERT OR UPDATE OF project_id ON lists/,
      'the trigger no longer covers both creating a list and moving one',
    )
    assert.match(
      trigger,
      /SELECT p\.space_id INTO NEW\.space_id/,
      'the trigger no longer derives the space from the project',
    )
  })

  it('project_id is still required — this half changes no meaning', () => {
    /*
     * Stated so the next person knows where the work stopped. Dropping the NOT
     * NULL is the step that changes what a list can be, and it needs the
     * create flow and the /space/project/list route to change with it.
     */
    assert.match(
      schema,
      /projectId:\s*uuid\('project_id'\)\.notNull\(\)/,
      'project_id became nullable without the create flow and routing to match',
    )
  })
})
