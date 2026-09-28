#!/usr/bin/env node
/**
 * A self-test for `scripts/lib/claim-match.mjs`.
 *
 * That module decides whether a break patch's `# Reddens:` claim counts as
 * verified, for 798 patches across two checkers — and every one of its rules
 * exists because a real claim was being misread. Each rule is also a loosening,
 * and a loosening is one edit away from a matcher that matches anything, which
 * is the check that cannot fail.
 *
 * So the rules are asserted here rather than only described in the comments
 * beside them. The two that matter most are the ones that say what the module
 * does NOT do:
 *
 *   - `norm` removes an ESCAPE from a backtick and keeps the backtick, so a
 *     claim still has to name the same frame: `12:41` must not match `12:40`.
 *   - `findsClaim` needs five consecutive words, so a four-word overlap must
 *     not verify a claim — that floor is the whole difference between finding
 *     rotted claims and reporting every template literal as rotted.
 *
 * And one that says what it must not READ: a single-quoted span must not be a
 * possessive. `the first person's row holds the first person's work` has two
 * apostrophes, and reading the span between them yields `s row holds the first
 * person`, which is not a sentence and would be reported as a claim no suite
 * contains.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { proveMutationsBite } from './lib/mutate.mjs'

/*
 * DYNAMIC, so `--mutate` can point these cases at a deliberately-broken copy.
 * A contract test that cannot be aimed at a broken subject proves only that its
 * own cases run — and this subject decides whether a break patch's claim is
 * verified at all, so every attribution number in the audit is downstream of
 * it being right.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SUBJECT = process.env.CLAIM_MATCH_LIB ?? './lib/claim-match.mjs'
const { norm, findsClaim, quotedIn, MIN_WORDS, sentencesOf, claimedWhole } = await import(SUBJECT)

let failed = 0
let ran = 0
const is = (got, want, what) => {
  ran += 1
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}

console.log('\n1. norm leaves only the words')
is(norm('the picker’s own list'), 'the pickers own list', 'a curly apostrophe is dropped')
is(norm('and "Find Blockers" now names'), 'and Find Blockers now names', 'an inner double quote is dropped')
is(norm('a \\"My runs\\" chip'), 'a My runs chip', 'and an escaped one from inside a Python string')
is(norm('an en – and an em — dash'), 'an en - and an em - dash', 'both dashes fold to a hyphen')
is(norm('  spaced   out \n words '), 'spaced out words', 'whitespace collapses')

console.log('\n2. and keeps what a claim still has to name')
is(
  norm('with frame \\`12:40\\`s own headline'),
  'with frame `12:40`s own headline',
  'the escape goes and the BACKTICK stays',
)
{
  const hay = norm('with frame \\`12:40\\`’s own headline, ${JSON.stringify(HEADLINE)}')
  is(findsClaim(hay, norm('with frame `12:40`’s own headline')), true, 'so the right frame verifies')
  is(findsClaim(hay, norm('with frame `12:41`’s own headline')), false, 'and the wrong frame does NOT')
}

console.log(`\n3. findsClaim needs ${MIN_WORDS} consecutive words — OF A FRAGMENT`)
{
  const hay = 'the grid is four columns wide at 1440px and holds every row'
  /*
   * THE FLOOR IS ON FRAGMENTS, NOT ON THE CLAIM, and asserting otherwise is
   * how this test first failed. `findsClaim` tries the whole string before it
   * tries any fragment, so a SHORT claim that appears verbatim verifies — and
   * that is the right way round: the author wrote exactly what the file says,
   * which is stronger evidence than a five-word overlap, not weaker.
   *
   * It also matters in practice. 28 quoted claims are under five words, and
   * most are correct: a claim quoting a UI LABEL the check names — "Find
   * Blockers", "+ Add Channel", "Contact your admin" — or the literal part of
   * a template literal, `publishes through publish_web_dist`, which is exactly
   * what the process doc tells authors to quote. Flooring the whole-string
   * path would reject all of them, which is tuning the matcher until today's
   * claims fail — the mirror of the mistake the floor exists to prevent.
   *
   * WHAT IT COSTS IS NAMED HERE SO NOBODY "FIXES" IT WITHOUT KNOWING. A
   * two-word verbatim claim is weak evidence: the words are in the suite, and
   * they do not pin the check. That is a real limit of matching on text, and
   * the run is what settles those — see the note on `mp-7-flat-bars` in the
   * module.
   */
  is(findsClaim(hay, 'four columns wide at'), true, 'a four-word claim that appears VERBATIM verifies')
  is(findsClaim(hay, 'the grid'), true, 'and so does a two-word one — weak evidence, but not absent')
  is(findsClaim(hay, 'the grid is four columns wide'), true, 'five words of the sentence verify')
  is(
    findsClaim(hay, 'wide at 1440px and holds every row plus more'),
    true,
    'a five-word FRAGMENT of a longer claim is enough',
  )
  is(
    findsClaim(hay, 'four columns wide plus words it does not have'),
    false,
    'but a four-word fragment of a longer claim is not',
  )
  /*
   * AND THE FLOOR'S VALUE IS PINNED, because the assertion above does not pin
   * it: lowering `MIN_WORDS` from 5 to 4 left this test green, which makes it a
   * test of the floor's existence and not of its height. The floor is the one
   * number in this module that a future loosening would reach for first — each
   * earlier loosening converted artefacts into verified claims, and one more
   * would convert real ones — so the pair below fails if it moves in either
   * direction.
   */
  is(
    findsClaim(hay, 'is four columns wide zzz qqq www'),
    false,
    `a claim whose longest overlap is FOUR words does not verify (floor is ${MIN_WORDS})`,
  )
  is(
    findsClaim(hay, 'grid is four columns wide zzz qqq'),
    true,
    'and one whose longest overlap is FIVE does',
  )
}

console.log('\n4. quotedIn prefers double quotes and falls back to single')
is(quotedIn('suite: "the row itself says why"'), ['the row itself says why'], 'a double-quoted span')
is(quotedIn("suite -- 'the row itself says why'"), ['the row itself says why'], 'a single-quoted one')
is(
  quotedIn(`suite: "one long enough span" and 'another long enough'`),
  ['one long enough span'],
  'with both present, only the double-quoted ones are read',
)
is(quotedIn('suite: "tooshort"'), ['tooshort'], 'eight characters is the floor, and this clears it')
is(quotedIn('suite: "short"'), [], 'and fewer is not a sentence')

console.log('\n5. and never reads a possessive as a span')
is(
  quotedIn("teams-person-cards the first person's row holds the first person's work"),
  [],
  'two apostrophes in prose yield nothing',
)
is(
  quotedIn("suite -- 'the first person\\'s row holds it'"),
  ['the first persons row holds it'],
  'while a real span containing an escaped apostrophe still reads',
)

console.log('\n7. a claim is a WHOLE sentence of the suite (claims-confirmed-by-a-fragment)')
{
  const SUITE = [
    "// one `summary backtick, never closed on this line, in a comment",
    "const re = /[‘’']/g",
    "chk(a, 'given a space with Full edit, a guest is offered a list in the Create menu', x)",
    "chk(b, 'the first half of a sentence ' + 'and the rest of it', y)",
    "chk(c, `every one of the ${n} tiles is offered in the grid`, z)",
    "chk(d, `the ${kind} item reads ${label}`, w)",
    "/* it's a comment */ chk(e, 'after the comment and the regex', v)",
  ].join('\n')
  const S = sentencesOf(SUITE)
  const w = (q) => claimedWhole(S, norm(q))
  is(w('given a space with Full edit, a guest is offered a list in the Create menu'), true, 'the whole literal sentence is claimed')
  is(w('a guest is offered a list in the Create menu'), false, 'a clause of it is not — eight words that also sit in a restated check (gcm-11)')
  is(w('the first half of a sentence and the rest of it'), true, 'a sentence built with + is read whole')
  is(w('every one of the 8 tiles is offered in the grid'), true, 'a template sentence matches with its values filled in')
  is(w('tiles is offered in the grid'), true, 'five or more words of a template sentence stand, since its values cannot be quoted in advance')
  is(w('offered in the grid'), false, 'but four words of it do not')
  is(w('the ${kind} item reads ${label}'), true, 'a template quoted in its source form is claimed')
  is(w('after the comment and the regex'), true, 'a quote inside a comment or a regex literal does not throw the reading off')
  is(w('summary backtick, never closed on this line, in a comment'), false, 'and a comment is not a sentence of the suite')
}

/*
 * AND A FLOOR ON HOW MANY ASSERTIONS RAN, because "all assertions hold" is true
 * of no assertions at all.
 *
 * Measured 22 September: with every assertion in this file commented out, it
 * printed exactly the line below and exited 0. All four contract tests did. The
 * ledger had said they "cannot go vacuous without going to zero cases" — which
 * is the failure itself, written down as though it were protection.
 *
 * So the count is asserted and then printed beside the verdict. A verdict that
 * does not say what it is about is the same shape as a suite reporting
 * `0 failed` for checks it never reached.
 */
let short = false
/*
 * AND THAT EACH CASE BITES. The floor below catches "every assertion deleted";
 * it cannot catch "the matcher is broken and the cases pass anyway". Each
 * mutation here is a way this module has ALREADY been wrong, or a relaxation
 * its own comments argue against.
 */
if (process.argv.includes('--mutate')) {
  failed += proveMutationsBite({
    subject: join(HERE, 'lib/claim-match.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'CLAIM_MATCH_LIB',
    label: 'the claim matcher',
    alive: (mutant) => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(mutant)})`], {
        encoding: 'utf8',
        timeout: 30_000,
      })
      return { ok: r.status === 0, why: (r.stderr ?? '').trim() }
    },
    mutations: [
      ['the five-word floor drops to four', 'export const MIN_WORDS = 5', 'export const MIN_WORDS = 4'],
      ['the floor drops away entirely', 'len >= MIN_WORDS', 'len >= 1'],
      ['only a whole-claim match counts, so interpolated sentences read as rotted', 'if (hay.includes(q)) return true', 'if (hay.includes(q)) return true\n  return false\n  // eslint-disable-next-line no-unreachable'],
      ['smart quotes stop being normalised', "/[‘’ʼ'\"“”]/g", '/__never_matches__/g'],
      ['escaped quotes stop being unescaped', '/\\\\(["\'`\\\\])/g', '/__never_matches__()/g'],
      ['runs of whitespace stop collapsing', '/\\s+/g', '/__never_matches__/g'],
      ['single-quoted claims stop being read', 'return [...block.matchAll(SINGLE)].map((m) => norm(m[2]))', 'return []'],
      ['a clause of a literal sentence is claimed again', '  if (sentences.literals.has(q)) return true\n', '  if ([...sentences.literals].some((l) => l.includes(q))) return true\n'],
      ['template fragments lose their five-word floor', '  const long = q.split(\' \').length >= MIN_WORDS\n', '  const long = true\n'],
      ['comments are read as source again', "    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\\n', i); i = e < 0 ? n : e; continue }\n", ''],
      ['sentences joined by + are not joined', '      add(body, tpl)\n    }', '    }'],
      ['a template quoted in its source form is refused', '      literals.add(norm(body))\n      if (parts', '      if (parts'],
      ['a possessive apostrophe opens a quote again', "/(^|[\\s([<\\u2014-])'((?:[^'\\\\]|\\\\.){8,}?)'(?=$|[\\s,.;:!?)\\]>\\u2014-])/g", "/()'((?:[^'\\\\]|\\\\.){8,}?)'()/g"],
    ],
  })
}

const MIN_ASSERTIONS = 20
if (ran < MIN_ASSERTIONS) {
  console.error(
    `\n[claim-match] only ${ran} assertion(s) ran, below the floor of ${MIN_ASSERTIONS}. ` +
      'A contract test that asserts nothing passes; this line is what stops it saying so.',
  )
  short = true
}
console.log(
  `\n${failed === 0 ? `[claim-match] all ${ran} assertions hold` : `[claim-match] ${failed} of ${ran} FAILED`}`,
)
process.exitCode = failed === 0 && !short ? 0 : 1
