import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { skillSlug } from './skills-api'

/**
 * §15 — the composer and the server must agree on what `/brand-voice` means.
 *
 * The rule exists twice: `apps/api/src/modules/skills/skill-slug.ts` decides
 * which skill a typed command resolves to, and `skills-api.ts` decides which
 * commands the composer offers. Two copies of one rule is the thing that rots,
 * and the failure is quiet in the worst way: the menu offers a command, the
 * person picks it, and the server answers "Unknown command" — which reads as
 * the feature being broken rather than two slugifiers disagreeing about a
 * hyphen.
 *
 * Sharing the code would be better, but the packages have no shared module and
 * inventing one for six lines is its own cost. So instead: read the server's
 * implementation, run it, and hold the two against each other over inputs
 * chosen to hit every branch.
 */

const SERVER = new URL('../../../api/src/modules/skills/skill-slug.ts', import.meta.url)

/** Extract and evaluate the server's `skillSlug` without importing the package. */
function serverSlug(): (name: string) => string {
  const source = readFileSync(SERVER, 'utf8')
  const match = /export function skillSlug\(name: string\): string \{([\s\S]*?)\n\}/.exec(source)
  assert.ok(match, 'could not find skillSlug in the API source — this test is now blind')
  // Strip the TS annotations the body does not need; the body is plain JS.
  const body = match[1]
  // eslint-disable-next-line no-new-func
  return new Function('name', body) as (name: string) => string
}

const NAMES = [
  'Personal Task Organizer',
  'Brand Voice',
  'Triage Tasks Like Me',
  '  Résumé   Polisher!  ',
  'Q&A / FAQ',
  'Weekly—Review',
  '---Weird---',
  '!!!',
  '',
  'a',
  'A'.repeat(30) + ' ' + 'B'.repeat(30),
  'Ünïcödé Nämes',
  'multiple   inner    spaces',
  'trailing-dash-',
  '123 numbers 456',
  'MiXeD CaSe',
]

describe('§15 the composer and the server slug names identically', () => {
  const onServer = serverSlug()

  it('finds the server implementation to compare against', () => {
    // Guards the guard: if the regex above stops matching, `serverSlug` throws
    // rather than silently comparing the client against itself.
    assert.equal(onServer('Brand Voice'), 'brand-voice')
  })

  for (const name of NAMES) {
    it(`agrees on ${JSON.stringify(name)}`, () => {
      assert.equal(
        skillSlug(name),
        onServer(name),
        'the composer would offer a command the server cannot resolve',
      )
    })
  }
})
