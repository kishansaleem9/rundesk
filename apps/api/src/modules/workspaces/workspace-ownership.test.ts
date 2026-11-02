import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { characterCount, cleanWorkspaceName, leaveRefusal, ownerProtected, transferRefusal } from './workspace-ownership'

// QA WS-002 — "Try names: empty, only spaces, 100+ characters, emoji. Empty or
// whitespace blocked; long names limited; emoji saved correctly."
describe('cleanWorkspaceName (QA WS-002)', () => {
  const refused = (raw: unknown) => {
    const r = cleanWorkspaceName(raw)
    return r.ok ? null : r.reason
  }
  const kept = (raw: unknown) => {
    const r = cleanWorkspaceName(raw)
    return r.ok ? r.name : null
  }

  it('refuses no name, an empty one and one of only spaces of any kind', () => {
    assert.match(refused(undefined) ?? '', /needs a name/)
    assert.match(refused('') ?? '', /blank/)
    assert.match(refused('     ') ?? '', /blank/)
    assert.match(refused('\u00a0\u3000\t\n') ?? '', /blank/)
    assert.match(refused('\u200b\u200b\u200b') ?? '', /blank/, 'zero-width spaces are not a name')
    assert.match(refused('\u200d\u200c\u2060') ?? '', /blank/, 'joiners alone are not a name')
  })

  it('trims either end and folds a run of whitespace inside into one space', () => {
    assert.equal(kept('  Acme Ops  '), 'Acme Ops')
    assert.equal(kept('\u00a0Acme \n\t Ops\u3000'), 'Acme Ops')
    assert.equal(kept('\ufeffAcme\u200b'), 'Acme')
  })

  it('keeps emoji whole, and counts one as one character', () => {
    assert.equal(kept('Launch 🚀'), 'Launch 🚀')
    assert.equal(kept('👩\u200d💻 Devs'), '👩\u200d💻 Devs', 'a joined emoji keeps its joiner')
    assert.equal(characterCount('👩\u200d💻'), 1)
    assert.equal(characterCount('🇵🇰'), 1)
    assert.equal(kept('🚀🚀'), '🚀🚀')
  })

  it('keeps a joiner a script needs inside a word', () => {
    // Urdu and Persian write some words with a zero-width non-joiner inside.
    assert.equal(kept('می\u200cخواهم'), 'می\u200cخواهم')
  })

  it('needs 2 characters and allows 60, counted as a person counts them', () => {
    assert.match(refused('A') ?? '', /at least 2/)
    assert.match(refused('🚀') ?? '', /at least 2/)
    assert.equal(kept('AB'), 'AB')
    assert.equal(kept('x'.repeat(60)), 'x'.repeat(60))
    assert.match(refused('x'.repeat(61)) ?? '', /at most 60 characters \(this one has 61\)/)
    assert.match(refused('x'.repeat(120)) ?? '', /at most 60/)
    // Sixty emoji are 120 UTF-16 units and still sixty characters.
    assert.equal(kept('🚀'.repeat(60)), '🚀'.repeat(60))
    assert.match(refused('🚀'.repeat(61)) ?? '', /at most 60/)
  })

  it('refuses control characters', () => {
    assert.match(refused('Acme\u0007Ops') ?? '', /control/)
    assert.match(refused('Acme\u0000') ?? '', /control/)
  })
})

// QA WS-015 and WS-016 — a member leaves; the owner is told to transfer first.
describe('leaveRefusal (QA WS-015, WS-016)', () => {
  it('lets a member, a manager, a guest and an admin who is not the owner leave', () => {
    for (const role of ['member', 'manager', 'guest']) {
      assert.equal(leaveRefusal('me', { ownerId: 'o', role, admins: 1 }), null, role)
    }
    assert.equal(leaveRefusal('me', { ownerId: 'o', role: 'workspace_admin', admins: 2 }), null)
  })

  it('tells the owner to transfer its ownership first', () => {
    assert.match(leaveRefusal('me', { ownerId: 'me', role: 'workspace_admin', admins: 3 }) ?? '', /Transfer its ownership/)
  })

  it('keeps the last admin of a workspace with no owner, and refuses a non-member', () => {
    assert.match(leaveRefusal('me', { ownerId: null, role: 'workspace_admin', admins: 1 }) ?? '', /only admin/)
    assert.match(leaveRefusal('me', { ownerId: 'o', role: null, admins: 1 }) ?? '', /not a member/)
  })
})

// QA WS-017 — "Transfer ownership to an Admin; confirm. New Owner gets Owner
// rights; previous Owner becomes Admin."
describe('transferRefusal (QA WS-017)', () => {
  const to = (role: string | null, extra: Partial<{ userId: string; isAgent: boolean }> = {}) => ({ userId: 'new', role, isAgent: false, ...extra })

  it('hands it to a member who is not a guest, with the name typed exactly', () => {
    for (const role of ['workspace_admin', 'manager', 'member']) {
      assert.equal(transferRefusal({ workspaceName: 'Acme', confirmName: 'Acme', ownerId: 'o', to: to(role) }), null, role)
    }
  })

  it('asks for the name typed exactly', () => {
    for (const typed of [undefined, '', 'acme', 'Acme ', ' Acme', 'Acm']) {
      assert.match(transferRefusal({ workspaceName: 'Acme', confirmName: typed, ownerId: 'o', to: to('member') }) ?? '', /name exactly/, String(typed))
    }
  })

  it('refuses a guest, an agent, a non-member and the owner themself', () => {
    assert.match(transferRefusal({ workspaceName: 'A', confirmName: 'A', ownerId: 'o', to: to('guest') }) ?? '', /guest/)
    assert.match(transferRefusal({ workspaceName: 'A', confirmName: 'A', ownerId: 'o', to: to('member', { isAgent: true }) }) ?? '', /agent/)
    assert.match(transferRefusal({ workspaceName: 'A', confirmName: 'A', ownerId: 'o', to: null }) ?? '', /must be a member/)
    assert.match(transferRefusal({ workspaceName: 'A', confirmName: 'A', ownerId: 'o', to: to(null) }) ?? '', /must be a member/)
    assert.match(transferRefusal({ workspaceName: 'A', confirmName: 'A', ownerId: 'new', to: to('workspace_admin') }) ?? '', /already/)
  })
})

describe('ownerProtected', () => {
  it('lets anybody else be removed or changed', () => {
    assert.equal(ownerProtected('someone', 'owner', { remove: true }), null)
    assert.equal(ownerProtected('someone', 'owner', { role: 'guest' }), null)
    assert.equal(ownerProtected('someone', null, { remove: true }), null)
  })

  it('keeps the owner in, and an admin', () => {
    assert.match(ownerProtected('owner', 'owner', { remove: true }) ?? '', /cannot be removed/)
    for (const role of ['manager', 'member', 'guest']) {
      assert.match(ownerProtected('owner', 'owner', { role }) ?? '', /always an admin/, role)
    }
    assert.equal(ownerProtected('owner', 'owner', { role: 'workspace_admin' }), null)
  })
})
