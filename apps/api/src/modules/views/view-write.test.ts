import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SHARED_VIEW_DELETE_LEVEL, SHARED_VIEW_LEVEL, levelOnView, viewOffers, viewWriteBar } from './view-write'

/**
 * WHO MAY CHANGE A LIST'S VIEWS (`found-5-oct/readers-change-shared-views`).
 * A shared view asks the level on it, Edit, and Full edit to delete it; a
 * private one is its maker's at any level; a protected one is its maker's and
 * the managers' on top of that. The list's default and a view made shared ask
 * the list's level besides.
 */
const READER = { reachesLevel: false, reachesDelete: false, listReachesLevel: false, manager: false }
const EDITOR = { reachesLevel: true, reachesDelete: false, listReachesLevel: true, manager: false }
const FULL = { reachesLevel: true, reachesDelete: true, listReachesLevel: true, manager: false }
const MANAGER = { reachesLevel: true, reachesDelete: true, listReachesLevel: true, manager: true }
/** Full edit on this one view by a share on it, in a list they only read. */
const SHARED_ONE_VIEW = { reachesLevel: true, reachesDelete: true, listReachesLevel: false, manager: false }
const me = { id: 'u-me' }
const view = (visibility: 'everyone' | 'private' | 'protected', createdById: string | null = 'u-admin', isDefault = false) => ({ visibility, createdById, isDefault })

describe('viewWriteBar — the level on a view decides its writes', () => {
  it('asks Edit of a shared view', () => {
    assert.equal(SHARED_VIEW_LEVEL, 'edit')
  })

  it('asks Full edit to delete a shared view', () => {
    assert.equal(SHARED_VIEW_DELETE_LEVEL, 'admin')
  })

  it('a reader below Edit changes no shared view — not the admin’s, not even one they made', () => {
    assert.equal(viewWriteBar(view('everyone'), me, READER), 'level')
    assert.equal(viewWriteBar(view('protected'), me, READER), 'level')
    assert.equal(viewWriteBar(view('everyone', me.id), me, READER), 'level')
  })

  it('a reader’s own private view stays theirs, at any level', () => {
    assert.equal(viewWriteBar(view('private', me.id), me, READER), null)
  })

  it('somebody else’s private view is nobody else’s to change, a manager’s neither', () => {
    assert.equal(viewWriteBar(view('private'), me, MANAGER), 'private')
  })

  it('at Edit a shared view may be changed; a protected one only by its maker or a manager', () => {
    assert.equal(viewWriteBar(view('everyone'), me, EDITOR), null)
    assert.equal(viewWriteBar(view('protected'), me, EDITOR), 'protected')
    assert.equal(viewWriteBar(view('protected', me.id), me, EDITOR), null)
    assert.equal(viewWriteBar(view('protected'), me, MANAGER), null)
  })

  it('deleting a shared view takes Full edit, where Edit changes it; a reader’s own private view is theirs to delete', () => {
    assert.equal(viewWriteBar(view('everyone'), me, EDITOR, 'delete'), 'level')
    assert.equal(viewWriteBar(view('everyone', me.id), me, EDITOR, 'delete'), 'level')
    assert.equal(viewWriteBar(view('everyone'), me, FULL, 'delete'), null)
    assert.equal(viewWriteBar(view('protected'), me, FULL, 'delete'), 'protected')
    assert.equal(viewWriteBar(view('private', me.id), me, READER, 'delete'), null)
  })

  it('a super-admin is not narrowed', () => {
    assert.equal(viewWriteBar(view('protected'), { id: 'u-sa', role: 'super_admin' }, READER), null)
    assert.equal(viewWriteBar(view('protected'), { id: 'u-sa', role: 'super_admin' }, READER, 'delete'), null)
  })
})

describe('levelOnView — a share on the view itself is the most specific grant', () => {
  it('a share on the view decides before the list’s, in either direction', () => {
    assert.equal(levelOnView({ level: 'edit', source: 'space-default' }, 'view'), 'view')
    assert.equal(levelOnView({ level: 'admin', source: 'item-share' }, 'comment'), 'comment')
    assert.equal(levelOnView({ level: 'view', source: 'space-default' }, 'admin'), 'admin')
    assert.equal(levelOnView({ level: 'view', source: 'guest-default' }, 'edit'), 'edit')
    assert.equal(levelOnView({ level: 'edit', source: 'space-default' }, null), 'edit')
  })

  it('a manager is not narrowed by a share on a view, and nobody resolved stays nobody', () => {
    assert.equal(levelOnView({ level: 'admin', source: 'workspace-role' }, 'view'), 'admin')
    assert.equal(levelOnView(null, 'view'), null)
  })
})

describe('viewOffers — the menu offers what the routes would take', () => {
  it('offers a reader nothing on a shared view', () => {
    assert.deepEqual(viewOffers(view('everyone'), me, READER), { mayChange: false, mayDelete: false, mayMakeDefault: false, mayChangeVisibility: false, mayMakePrivate: false })
  })

  it('offers a reader their own private view to change, never as the default, and not to share', () => {
    assert.deepEqual(viewOffers(view('private', me.id), me, READER), { mayChange: true, mayDelete: true, mayMakeDefault: false, mayChangeVisibility: false, mayMakePrivate: false })
  })

  it('offers an editor a shared view to change and default, and who sees it only when it is theirs or they manage', () => {
    assert.deepEqual(viewOffers(view('everyone'), me, EDITOR), { mayChange: true, mayDelete: false, mayMakeDefault: true, mayChangeVisibility: false, mayMakePrivate: false })
    assert.deepEqual(viewOffers(view('everyone', me.id), me, EDITOR), { mayChange: true, mayDelete: false, mayMakeDefault: true, mayChangeVisibility: true, mayMakePrivate: true })
    assert.deepEqual(viewOffers(view('everyone'), me, MANAGER), { mayChange: true, mayDelete: true, mayMakeDefault: true, mayChangeVisibility: true, mayMakePrivate: true })
    assert.deepEqual(viewOffers(view('private', me.id), me, EDITOR), { mayChange: true, mayDelete: true, mayMakeDefault: false, mayChangeVisibility: true, mayMakePrivate: false })
  })

  it('offers Delete at Full edit, and on a reader’s own private view, never at Edit', () => {
    assert.equal(viewOffers(view('everyone'), me, EDITOR).mayDelete, false)
    assert.equal(viewOffers(view('everyone', me.id), me, EDITOR).mayDelete, false)
    assert.equal(viewOffers(view('everyone'), me, FULL).mayDelete, true)
    assert.equal(viewOffers(view('private', me.id), me, READER).mayDelete, true)
  })

  it('offers a view shared with them at Full edit to change and delete, but not as the list’s default', () => {
    assert.deepEqual(viewOffers(view('everyone'), me, SHARED_ONE_VIEW), { mayChange: true, mayDelete: true, mayMakeDefault: false, mayChangeVisibility: false, mayMakePrivate: false })
  })

  it('offers Private on no default view, which the server refuses; Protect stays offered there', () => {
    const own = viewOffers(view('everyone', me.id, true), me, EDITOR)
    assert.equal(own.mayMakePrivate, false)
    assert.equal(own.mayChangeVisibility, true)
    assert.equal(viewOffers(view('everyone', me.id, false), me, EDITOR).mayMakePrivate, true)
    assert.equal(viewOffers(view('everyone', 'u-other', true), me, MANAGER).mayMakePrivate, false)
  })
})
