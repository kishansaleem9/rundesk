import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { VIEW_ONLY_DEFAULTS, readViewOnlyChange } from './view-only'

/*
 * A CHANGE OF A PERSON'S VIEW-ONLY SWITCHES (`found-25-sep/view-only-individual-permissions`):
 * only ClickUp's four, each true or false, and nothing else written.
 */
describe('readViewOnlyChange', () => {
  it('takes any of the four, each true or false, as the columns to write', () => {
    assert.deepEqual(readViewOnlyChange({ tags: true, timeTracking: false }), { ok: true, set: { viewOnlyTags: true, viewOnlyTimeTracking: false } })
    assert.deepEqual(readViewOnlyChange({ timeEstimates: false, createViews: true }), { ok: true, set: { viewOnlyTimeEstimates: false, viewOnlyCreateViews: true } })
  })

  it('refuses a name that is not one of them, a value that is not true or false, and nothing at all', () => {
    assert.deepEqual(readViewOnlyChange({ tags: true, role: 'workspace_admin' }), { ok: false, reason: 'Unknown view-only permission: role' })
    assert.deepEqual(readViewOnlyChange({ tags: 'yes' }), { ok: false, reason: 'View-only permission tags must be true or false' })
    for (const raw of [{}, null, [], 'tags']) {
      assert.deepEqual(readViewOnlyChange(raw), { ok: false, reason: 'Send the permissions to change, each true or false' })
    }
  })

  it('starts each person where ClickUp does: estimates and tracking on, tags and views off', () => {
    assert.deepEqual(VIEW_ONLY_DEFAULTS, { timeEstimates: true, timeTracking: true, tags: false, createViews: false })
  })
})
