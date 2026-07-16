import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseTaskRefsFromMessage,
  normalizePushCommits,
  buildCommitLinkFields,
  shortSha,
} from './git-commit-links.util'

/**
 * §12.8 — commit-message → task-reference parsing for the inbound push webhook.
 * Pure, no DB / no network.
 */

const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const UUID_B = 'a1b2c3d4-e5f6-4789-abcd-0123456789ab'

describe('parseTaskRefsFromMessage — reference markers', () => {
  it('matches the conventional RD-<uuid> token', () => {
    assert.deepEqual(parseTaskRefsFromMessage(`fix login flow RD-${UUID_A}`), [UUID_A])
  })

  it('matches the #<uuid> token', () => {
    assert.deepEqual(parseTaskRefsFromMessage(`bugfix #${UUID_A}`), [UUID_A])
  })

  it('matches a pasted deep-link ?task=<uuid> query param', () => {
    const msg = `see https://app.rundesk.com/app/w/s/p/l?task=${UUID_A} for context`
    assert.deepEqual(parseTaskRefsFromMessage(msg), [UUID_A])
  })

  it('matches /task/<uuid> and /tasks/<uuid> path forms', () => {
    assert.deepEqual(parseTaskRefsFromMessage(`ref /task/${UUID_A}`), [UUID_A])
    assert.deepEqual(parseTaskRefsFromMessage(`ref /tasks/${UUID_A}`), [UUID_A])
  })

  it('is case-insensitive on the RD- marker and lower-cases the id', () => {
    const upper = UUID_A.toUpperCase()
    assert.deepEqual(parseTaskRefsFromMessage(`rd-${upper}`), [UUID_A])
  })

  it('extracts multiple distinct refs and de-duplicates', () => {
    const msg = `RD-${UUID_A} and #${UUID_B} plus a dup RD-${UUID_A}`
    assert.deepEqual(parseTaskRefsFromMessage(msg), [UUID_A, UUID_B])
  })

  it('handles a multi-line message (subject + body trailer)', () => {
    const msg = `feat: add export\n\nDetails here.\n\nCloses RD-${UUID_B}`
    assert.deepEqual(parseTaskRefsFromMessage(msg), [UUID_B])
  })

  it('returns [] when there is no marker (bare uuid is ignored)', () => {
    assert.deepEqual(parseTaskRefsFromMessage(`chore: bump deps ${UUID_A}`), [])
  })

  it('does not match RD- glued to a preceding word char (word boundary)', () => {
    assert.deepEqual(parseTaskRefsFromMessage(`wordRD-${UUID_A}`), [])
  })

  it('returns [] for empty / null / undefined', () => {
    assert.deepEqual(parseTaskRefsFromMessage(''), [])
    assert.deepEqual(parseTaskRefsFromMessage(null), [])
    assert.deepEqual(parseTaskRefsFromMessage(undefined), [])
  })
})

describe('normalizePushCommits', () => {
  it('normalizes a GitHub push payload', () => {
    const payload = {
      ref: 'refs/heads/main',
      repository: { full_name: 'acme/webapp' },
      commits: [
        { id: 'abcdef1234567890', message: `fix RD-${UUID_A}`, url: 'https://github.com/acme/webapp/commit/abcdef1234567890', author: { name: 'Dev' } },
        { id: 'deadbeefcafebabe', message: 'no ref here', url: 'https://github.com/acme/webapp/commit/deadbeefcafebabe' },
      ],
    }
    const out = normalizePushCommits('github', payload)
    assert.equal(out.length, 2)
    assert.equal(out[0].sha, 'abcdef1234567890')
    assert.equal(out[0].repoSlug, 'acme/webapp')
    assert.equal(out[0].authorName, 'Dev')
    assert.equal(out[0].message, `fix RD-${UUID_A}`)
  })

  it('normalizes a GitLab push payload (path_with_namespace + username author)', () => {
    const payload = {
      object_kind: 'push',
      project: { path_with_namespace: 'group/sub/webapp' },
      commits: [{ id: 'aaaaaaaaaaaa', message: `#${UUID_B}`, url: 'https://gitlab.com/group/sub/webapp/-/commit/aaaaaaaaaaaa', author: { username: 'gluser' } }],
    }
    const out = normalizePushCommits('gitlab', payload)
    assert.equal(out.length, 1)
    assert.equal(out[0].repoSlug, 'group/sub/webapp')
    assert.equal(out[0].authorName, 'gluser')
  })

  it('returns [] for missing / malformed payloads', () => {
    assert.deepEqual(normalizePushCommits('github', null), [])
    assert.deepEqual(normalizePushCommits('github', {}), [])
    assert.deepEqual(normalizePushCommits('github', { commits: 'nope' }), [])
  })

  it('skips commits without a sha', () => {
    const out = normalizePushCommits('github', { repository: { full_name: 'a/b' }, commits: [{ message: 'x' }] })
    assert.equal(out.length, 0)
  })
})

describe('buildCommitLinkFields — matches external-links.util commit shape', () => {
  it('builds GitHub owner/repo ref and <slug>@<sha> external id', () => {
    const f = buildCommitLinkFields('github', 'acme/webapp', 'abcdef1234567890')
    assert.equal(f.externalId, 'acme/webapp@abcdef1234567890')
    assert.equal(f.title, 'acme/webapp@abcdef1')
    assert.deepEqual(f.ref, { owner: 'acme', repo: 'webapp', sha: 'abcdef1234567890' })
  })

  it('builds GitLab projectPath ref', () => {
    const f = buildCommitLinkFields('gitlab', 'group/sub/webapp', 'aaaaaaabbbbb')
    assert.equal(f.externalId, 'group/sub/webapp@aaaaaaabbbbb')
    assert.deepEqual(f.ref, { projectPath: 'group/sub/webapp', sha: 'aaaaaaabbbbb' })
  })

  it('shortSha shortens hex shas but leaves non-hex untouched', () => {
    assert.equal(shortSha('abcdef1234567890'), 'abcdef1')
    assert.equal(shortSha('HEAD'), 'HEAD')
  })
})
