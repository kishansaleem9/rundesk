import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FLAGS, FLAG_CATEGORIES, SIGNUP_FEATURE_FLAGS } from '@rundesk/feature-flags'
import { signupFeatureRows } from './signup-features'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/*
 * Found by walking up for the workspace marker, rather than from
 * `import.meta.url` or `process.cwd()`.
 *
 * `import.meta.dirname` is undefined under the tsx loader these tests run
 * with, and `import.meta.url` compiles fine there but breaks `tsc -p
 * tsconfig.build.json`, whose module setting forbids the meta-property — so a
 * test file took the whole API build down with it. cwd is no better: it is
 * apps/api today and would silently stop resolving the moment tests are
 * launched from anywhere else.
 */
function repoRoot(): string {
  let dir = __dirname
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    dir = dirname(dir)
  }
  throw new Error('could not find the repo root from ' + __dirname)
}
const HERE = __dirname
const REPO = repoRoot()

/**
 * G08-4 [08:43], [09:02] — the feature picker has to actually pick.
 *
 * The wizard's second step promises, in as many words: "Pick what you'll use —
 * we'll turn the rest off so the workspace stays uncluttered." The picks were
 * sent, the DTO declared them, and `signUp()` read them nowhere. The sentence
 * was false and the workspace came up with platform defaults whatever anybody
 * ticked.
 *
 * Two things can go wrong here and neither is visible from a screenshot:
 *
 *  1. a pill that governs no flags — a checkbox with no effect, which is the
 *     same defect wearing a different hat
 *  2. the wizard and the server disagreeing about the set of pills, so a pill
 *     is offered that the server ignores, or a flag is switched off for a
 *     question nobody was asked
 *
 * The second is why these tests read the wizard's own list out of the source
 * rather than restating it: a copy would drift, and drift is the failure.
 */

const WIZARD = readFileSync(join(REPO, 'apps/web/src/pages/sign-up-page.tsx'), 'utf8')

/** The pill keys the signup wizard actually offers, read off the source. */
function wizardPillKeys(): string[] {
  const block = /const FEATURE_PILLS = \[(.*?)\] as const/s.exec(WIZARD)?.[1] ?? ''
  return [...block.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((m) => m[1])
}

describe('G08-4 — the signup feature picker configures the workspace', () => {
  it('offers no pill that governs nothing', () => {
    for (const [pill, keys] of Object.entries(SIGNUP_FEATURE_FLAGS)) {
      assert.ok(Array.isArray(keys) && keys.length > 0, `pill "${pill}" governs no flags`)
    }
  })

  it('covers every pill the wizard shows', () => {
    const offered = wizardPillKeys()
    assert.ok(offered.length >= 10, `only found ${offered.length} pills — the regex probably drifted`)
    const missing = offered.filter((key) => !SIGNUP_FEATURE_FLAGS[key])
    assert.deepEqual(
      missing,
      [],
      `the wizard offers pills the server does nothing with: ${missing.join(', ')}`,
    )
  })

  it('governs no pill the wizard does not show', () => {
    // The other direction: a mapping entry with no pill would switch features
    // off for a question the user was never asked.
    const offered = new Set(wizardPillKeys())
    const orphans = Object.keys(SIGNUP_FEATURE_FLAGS).filter((key) => !offered.has(key))
    assert.deepEqual(orphans, [], `the server acts on pills nobody is offered: ${orphans.join(', ')}`)
  })

  it('names only real flags', () => {
    const known = new Set<string>(Object.values(FLAGS))
    for (const [pill, keys] of Object.entries(SIGNUP_FEATURE_FLAGS)) {
      for (const key of keys) {
        assert.ok(known.has(key), `pill "${pill}" names "${key}", which is not a flag`)
      }
    }
  })

  it('keeps the category pills in step with the categories themselves', () => {
    // These delegate rather than restate, so a flag added to a category is
    // covered by signup automatically. If someone inlines the list instead,
    // this catches the copy going stale.
    for (const pill of ['core', 'views', 'ai', 'chat', 'time_tracking', 'reporting', 'integrations']) {
      assert.deepEqual(
        SIGNUP_FEATURE_FLAGS[pill],
        FLAG_CATEGORIES[pill],
        `pill "${pill}" has drifted from FLAG_CATEGORIES.${pill}`,
      )
    }
  })

  it('leaves auth alone, because the wizard never asks about it', () => {
    // Writing rows for settings the user never saw would be its own dishonesty
    // — and switching SSO off for somebody who did not choose that would lock
    // a workspace out of the login they expected.
    const governed = new Set(Object.values(SIGNUP_FEATURE_FLAGS).flat())
    for (const authFlag of FLAG_CATEGORIES.auth) {
      assert.ok(!governed.has(authFlag), `signup must not touch ${authFlag}`)
    }
  })

  it('turns the picks into rows that say on for chosen and off for the rest', () => {
    // The behaviour the false copy promised, checked directly rather than
    // through eight mocked inserts.
    const rows = signupFeatureRows(['docs', 'goals'], { id: 'ws1' }, 'u1')
    const byKey = new Map(rows.map((r) => [r.flagKey, r]))

    assert.equal(byKey.get(FLAGS.DOCS)?.enabled, true, 'a chosen pill is on')
    assert.equal(byKey.get(FLAGS.GOALS)?.enabled, true, 'and so is the other one')
    assert.equal(byKey.get(FLAGS.CHAT)?.enabled, false, '"we\'ll turn the rest off"')
    assert.equal(byKey.get(FLAGS.AI)?.enabled, false, 'including the expensive rest')

    // Scoped to the workspace that was just made, and attributed.
    for (const row of rows) {
      assert.equal(row.scope, 'workspace')
      assert.equal(row.scopeId, 'ws1')
      assert.equal(row.workspaceId, 'ws1')
      assert.equal(row.updatedBy, 'u1')
    }
    // Auth is untouched: nobody was asked.
    for (const authFlag of FLAG_CATEGORIES.auth) {
      assert.ok(!byKey.has(authFlag), `signup wrote a row for ${authFlag}`)
    }
  })

  it('tells "unticked everything" apart from "never saw the picker"', () => {
    /*
     * An absent list means an API client, or an older web build, that never
     * went through the wizard. Switching every feature off for them would be a
     * silent, destructive answer to a question they were never asked — so it
     * writes nothing and the platform defaults stand.
     *
     * An empty array is a real answer, and is honoured.
     */
    assert.deepEqual(signupFeatureRows(undefined, { id: 'ws1' }, 'u1'), [])
    const emptied = signupFeatureRows([], { id: 'ws1' }, 'u1')
    assert.ok(emptied.length > 0, 'an explicit empty pick still writes rows')
    assert.ok(emptied.every((r) => r.enabled === false), 'and they are all off')
  })

  it('no longer asks for anything nobody reads', () => {
    /*
     * `industry` and `teamSize` were REQUIRED to advance past step 1
     * (sign-up-page.tsx canAdvance) and were read by nothing on the server —
     * two compulsory questions collecting data with no consumer.
     *
     * The walkthrough settles it: across 386 transcript lines and 143
     * catalogued frames she never says either word, and the ClickUp wizard she
     * holds up as the model does not ask them either.
     *
     * Asserted on the wizard AND the DTO, because leaving the field on the DTO
     * is how it comes back — somebody sees it and wires a form to it.
     */
    assert.ok(!/industry/i.test(WIZARD), 'the wizard is asking about industry again')
    assert.ok(!/teamSize/i.test(WIZARD), 'the wizard is asking about team size again')
    const dto = readFileSync(join(HERE, 'dto/signup.dto.ts'), 'utf8')
    const declared = dto.replace(/\/\*[\s\S]*?\*\//g, '')
    assert.ok(!/industry\?:/.test(declared), 'the signup DTO declares industry again')
    assert.ok(!/teamSize\?:/.test(declared), 'the signup DTO declares teamSize again')
  })

  it('is actually read by signUp', () => {
    /*
     * The check that would have caught the original bug. Everything above can
     * pass with the mapping sitting in a file nothing imports — which is
     * exactly the state this gap describes: the picks were sent, declared, and
     * read by nobody.
     */
    const authService = readFileSync(join(HERE, 'auth.service.ts'), 'utf8')
    assert.match(
      authService,
      /signupFeatureRows/,
      'auth.service.ts does not call the row builder at all',
    )
    assert.match(
      authService,
      /dto\.features/,
      'auth.service.ts never reads the features the wizard sent',
    )
  })
})
