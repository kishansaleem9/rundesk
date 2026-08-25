import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isReservedSlug, resolveSlug, skillSlug } from './skill-slug'

/**
 * §15 — "The /Slash Command for AI Skills appears for everyone in the
 * Workspace." The command is how a skill is actually reached, so what it
 * resolves to has to be unsurprising.
 */

describe('§15 a skill’s slash command', () => {
  it('is the name, typable', () => {
    assert.equal(skillSlug('Personal Task Organizer'), 'personal-task-organizer')
    assert.equal(skillSlug('Brand Voice'), 'brand-voice')
    assert.equal(skillSlug('Triage Tasks Like Me'), 'triage-tasks-like-me')
  })

  it('survives punctuation, accents and spacing', () => {
    // A command nobody can type on their keyboard is not a command.
    assert.equal(skillSlug('  Résumé   Polisher!  '), 'resume-polisher')
    assert.equal(skillSlug('Q&A / FAQ'), 'q-a-faq')
    assert.equal(skillSlug('Weekly—Review'), 'weekly-review')
  })

  it('never ends or begins with a separator', () => {
    for (const name of ['---Weird---', '!!!', 'Trailing   ', '  Leading']) {
      const slug = skillSlug(name)
      assert.doesNotMatch(slug, /^-|-$/, `"${name}" → "${slug}"`)
    }
  })

  it('stays bounded, and still does not end on a dash after truncation', () => {
    // Slicing mid-word can leave a trailing dash, which would render a command
    // that looks like a typo.
    const slug = skillSlug('A'.repeat(30) + ' ' + 'B'.repeat(30))
    assert.ok(slug.length <= 40)
    assert.doesNotMatch(slug, /-$/)
  })

  it('gives an unnameable skill an empty slug rather than a bare slash', () => {
    // "/" alone would collide with the composer's own command menu.
    assert.equal(skillSlug('!!!'), '')
    assert.equal(skillSlug(''), '')
  })

  it('knows which commands the composer already owns', () => {
    assert.ok(isReservedSlug('task'))
    assert.ok(isReservedSlug('remind'))
    assert.ok(!isReservedSlug('brand-voice'))
  })
})

describe('§15 resolving a typed command', () => {
  const skills = [
    { id: '1', name: 'Brand Voice' },
    { id: '2', name: 'Personal Task Organizer' },
  ]

  it('finds the one skill meant', () => {
    const r = resolveSlug('brand-voice', skills)
    assert.equal(r.kind, 'match')
    assert.equal(r.kind === 'match' && r.skill.id, '1')
  })

  it('says nothing matched rather than guessing', () => {
    assert.equal(resolveSlug('nope', skills).kind, 'none')
  })

  it('reports a collision instead of picking by row order', () => {
    // Two names can slug the same — one person's "Brand Voice" and another's
    // "Brand-Voice". Taking the first would make the command mean different
    // things on different days depending on what the database returned first.
    const colliding = [...skills, { id: '3', name: 'Brand-Voice' }]
    const r = resolveSlug('brand-voice', colliding)
    assert.equal(r.kind, 'ambiguous')
    assert.deepEqual(r.kind === 'ambiguous' && r.names, ['Brand Voice', 'Brand-Voice'])
  })

  it('does not match an unnameable skill on an empty command', () => {
    const r = resolveSlug('', [{ id: '9', name: '!!!' }])
    assert.equal(r.kind, 'match', 'guard: an empty slug does match an empty slug')
    // …which is why the caller must refuse an empty command before asking.
    assert.equal(skillSlug('!!!'), '')
  })
})
