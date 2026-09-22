/*
 * "EACH CASE BITES", IN ONE PLACE, BECAUSE WRITING IT SIX TIMES WENT BADLY.
 *
 * Four case files had grown their own copy of this loop and THREE of them were
 * wrong, each in a different way, each reporting N of N bite while proving
 * nothing:
 *
 *   · `check-suite-enders` wrote its mutant into a temp DIRECTORY, and the file
 *     under test imports `./lib/suite-reads.mjs`. Every mutant died with
 *     ERR_MODULE_NOT_FOUND before executing a line of the rule it was meant to
 *     break. All twelve "reddened", each with exactly 31 cases — a crash, seen
 *     from outside. The uniform number was the only tell.
 *
 *   · `check-patch-guard` did the same, and its subject resolves its scan roots
 *     relative to ITSELF. A mutant in /tmp found none of them and failed the
 *     one case written to catch relative roots, whatever the mutation was. A
 *     NO-OP mutation — one word inside a comment — "reddened" a case.
 *
 *   · `check-model-stub` counted a mutant that exited non-zero while naming no
 *     case at all. A `JSON.parse` in a case had thrown on the mutant's output,
 *     so the file died before it could report, and the exit code was about the
 *     harness rather than the subject. "0 case(s)" was the tell.
 *
 * Three ways to be fooled, all of them the same mistake underneath: reading an
 * exit code as evidence about the thing under test when it was evidence about
 * the plumbing. So the three guards live here and every caller gets all three.
 *
 * WHAT A MUTATION HAS TO DO TO COUNT:
 *
 *   1. ANCHOR EXACTLY ONCE in the subject. Zero means the text moved and the
 *      mutation is measuring nothing; more than one means it is measuring
 *      something broader than it says.
 *   2. STILL RUN. The mutant is walked through `alive` — a caller-supplied
 *      smoke run — and a mutant that cannot start proves nothing.
 *   3. NAME A CASE. Non-zero with nothing named means the case file stopped
 *      before it could report.
 *
 * AND THE MUTANT IS WRITTEN BESIDE THE SUBJECT, never over it and never
 * somewhere else. Beside, so its relative imports and its own path arithmetic
 * behave; never over, because `check-suite-section-enders.mjs` was twice found
 * on disk with a rule deleted by an interrupted run, and `process.on('exit')`
 * does not fire on SIGKILL. A dotted name keeps it out of anything that walks
 * the directory, and a `finally` removes it.
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, basename, extname } from 'node:path'
import { spawnSync } from 'node:child_process'

/*
 * `\bFAIL\b` AND NOT `includes('FAIL')`, which is what three of these counted
 * with. The substring also matches the word FAILURE inside a PASSING case's own
 * sentence — "a root that is not there is a FAILURE, not a silent skip" was
 * counted as a failing case every time it passed. The word boundary refuses
 * that (FAILURE has a word character after the L) and still matches both
 * spellings in the tree: a bare `  FAIL …` and an ANSI-wrapped one.
 */
export const NAMED_FAIL = /\bFAIL\b/
export const namedFailures = (stdout) =>
  (stdout ?? '').split('\n').filter((l) => NAMED_FAIL.test(l)).length

/**
 * Apply each mutation to `subject`, re-run `caseFile` against the mutant, and
 * require the cases to notice.
 *
 * @param {object} o
 * @param {string} o.subject   absolute path to the file being mutated
 * @param {string} o.caseFile  absolute path to the case file to re-run
 * @param {string} o.envVar    the variable `caseFile` reads to find its subject
 * @param {Array<[string, string, string]>} o.mutations  [label, from, to]
 * @param {(mutantPath: string) => {ok: boolean, why?: string}} [o.alive]
 *        a smoke run proving the mutant executes. Omit only when the subject
 *        cannot fail to load, and say so at the call site.
 * @param {string} [o.label]   what to call the subject in the report
 * @returns {number} how many mutations proved nothing
 */
export function proveMutationsBite({ subject, caseFile, envVar, mutations, alive, label = 'the subject' }) {
  const ORIGINAL = readFileSync(subject, 'utf8')
  const ext = extname(subject) || '.mjs'
  const stem = basename(subject, ext)
  let blind = 0

  console.log(`\n▶ and each mutation of ${label} reddens a case`)
  for (const [name, from, to] of mutations) {
    const hits = ORIGINAL.split(from).length - 1
    if (hits !== 1) {
      console.log(`  \x1b[31mANCHOR ${hits === 0 ? 'MISS' : 'AMBIGUOUS'}\x1b[0m ${name} (${hits} match(es))`)
      blind += 1
      continue
    }
    const mutant = join(dirname(subject), `.${stem}-mutant-${name.replace(/\W+/g, '-')}${ext}`)
    try {
      writeFileSync(mutant, ORIGINAL.split(from).join(to))

      if (alive) {
        const a = alive(mutant)
        if (!a.ok) {
          console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${name} — the mutant did not run: ${(a.why ?? '').split('\n')[0]}`)
          blind += 1
          continue
        }
      }

      const r = spawnSync(process.execPath, [caseFile], {
        encoding: 'utf8',
        timeout: 180_000,
        env: { ...process.env, [envVar]: mutant },
      })
      const named = namedFailures(r.stdout)
      if (r.status === 0) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${name} — every case still passes`)
        blind += 1
      } else if (named === 0) {
        console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${name} — it exited non-zero but named no case`)
        blind += 1
      } else {
        console.log(`  \x1b[32mreddens\x1b[0m ${name} (${named} case(s))`)
      }
    } finally {
      rmSync(mutant, { force: true })
    }
  }

  console.log(
    `\n${blind === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} mutations: ` +
      `${mutations.length - blind} of ${mutations.length} bite`,
  )
  return blind
}
