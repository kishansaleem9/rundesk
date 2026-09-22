#!/usr/bin/env node
/*
 * THE GUARD THAT REFUSES TO SHIP A BREAK PATCH, BROKEN ON PURPOSE.
 *
 * `check-no-break-patches.mjs` exists because `43f7b57` shipped
 * `data-testid="task-add-fields-DISABLED"` to main: a control that renders and
 * does nothing, found only because the agent whose patch it was went looking
 * through HEAD afterwards. Its own header says "vigilance is not a control.
 * This is."
 *
 * And it was the weakest zero in the set. Its roots were RELATIVE and reached
 * through `fs.existsSync(root)`, so from any directory but the repository root
 * every root missed, the walk visited nothing, and it printed "clean — no
 * break-patch signatures in apps, packages or test" and exited 0. Measured
 * from `/tmp`: exactly that. `preflight.sh` happens to `cd` first, which is
 * why it went unnoticed for as long as it existed.
 *
 * So the roots are anchored to the script, a missing root is a failure rather
 * than a skip, the file count is asserted against a floor, and "clean" now
 * says how many files it read. This file is what keeps all four true.
 *
 * IT PLANTS INTO A THROWAWAY TREE, never into this one. A case file that
 * writes `BROKEN:` into a real component and restores it afterwards is the
 * exact accident the guard was written after — a step-6 edit outliving the
 * step. A test for this guard must not need the guard.
 *
 *   node scripts/check-patch-guard.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GUARD = join(HERE, 'check-no-break-patches.mjs')

let pass = 0
let fail = 0
const failures = []
const chk = (cond, good, bad) => {
  if (cond) {
    pass += 1
    console.log(`  \x1b[32mPASS\x1b[0m ${good}`)
  } else {
    fail += 1
    failures.push(bad ?? good)
    console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`)
  }
}

/*
 * Build a miniature repository — the three roots the guard walks, with the
 * files given — and run the guard against it. `cwd` is deliberately somewhere
 * else entirely: the guard must not care where it was invoked from, and that
 * was the whole defect.
 */
const plant = (files, { roots = ['apps', 'packages', 'test'] } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'patch-guard-'))
  try {
    for (const r of roots) mkdirSync(join(dir, r, 'src'), { recursive: true })
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true })
      writeFileSync(join(dir, rel), body)
    }
    const r = spawnSync(process.execPath, [GUARD], {
      encoding: 'utf8',
      cwd: tmpdir(),
      env: { ...process.env, BREAK_SCAN_ROOT: dir },
    })
    return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const CLEAN = {
  'apps/src/a.tsx': 'export const A = () => <span data-testid="a" />\n',
  'packages/src/b.ts': 'export const b = 1\n',
  'test/src/c.mjs': 'export const c = 2\n',
}

console.log('\n▶ a tree with nothing in it to find')

{
  const res = plant(CLEAN)
  chk(res.code === 0, 'a clean tree passes', `it exited ${res.code}: ${res.out.trim().slice(0, 160)}`)
  chk(
    /3 file\(s\) read/.test(res.out),
    'and says how many files it read — "clean" without a count is a statement about nothing',
    `it reported ${JSON.stringify(res.out.trim().slice(0, 160))}`,
  )
}

console.log('\n▶ the two signatures a break patch leaves')

{
  const res = plant({
    ...CLEAN,
    'apps/src/broken.tsx': '// BROKEN: a line cut out of the product\nexport const X = 1\n',
  })
  chk(res.code === 1, 'a `BROKEN:` comment fails the guard', `it exited ${res.code}`)
  chk(
    res.out.includes('broken.tsx') && res.out.includes('BROKEN:'),
    'naming the file and explaining what the signature is',
    'the failure did not name the file, or did not say what a `BROKEN:` comment means',
  )
}

{
  const res = plant({
    ...CLEAN,
    'apps/src/disabled.tsx': 'export const X = () => <span data-testid="add-fields-DISABLED" />\n',
  })
  chk(res.code === 1, 'a `-DISABLED` testid fails the guard — the shape `43f7b57` shipped', `it exited ${res.code}`)
  chk(
    res.out.includes('disabled.tsx') && res.out.includes('-DISABLED'),
    'and is named the same way',
    'the failure did not name the file or the signature',
  )
}

console.log('\n▶ and a hit in each root, because a root walked is not three roots walked')

for (const root of ['apps', 'packages', 'test']) {
  const res = plant({ ...CLEAN, [`${root}/src/hit.ts`]: '// BROKEN: here\n' })
  chk(res.code === 1, `a signature under \`${root}\` is found`, `a signature under ${root} was missed`)
}

console.log('\n▶ the two ways the scan can cover nothing and say nothing')

{
  /*
   * `test/` IS LEFT OUT OF THE FILES TOO, not only out of `roots` — the first
   * version of this case passed `CLEAN` and failed, because writing
   * `test/src/c.mjs` creates `test/` on the way to the file and the root was
   * never missing. A case that cannot produce the state it is about is a case
   * that proves nothing, which is the shape this whole file is here for.
   */
  const res = plant(
    {
      'apps/src/a.tsx': 'export const A = 1\n',
      'packages/src/b.ts': 'export const b = 1\n',
    },
    { roots: ['apps', 'packages'] },
  )
  chk(
    res.code === 1 && /do not exist/.test(res.out),
    'a root that is not there is a FAILURE, not a silent skip — this was the defect',
    `a missing root exited ${res.code}: ${res.out.trim().slice(0, 160)}`,
  )
}

{
  // Every file carries an extension the guard does not read, so the walk finds
  // the roots, opens nothing, and would otherwise report a clean tree.
  const res = plant({
    'apps/src/a.txt': '// BROKEN: invisible to the extension filter\n',
    'packages/src/b.md': '// BROKEN: likewise\n',
    'test/src/c.yaml': '# BROKEN: likewise\n',
  })
  chk(
    res.code === 1 && /below the floor/.test(res.out),
    'and a scan that reads zero files is a failure too',
    `a zero-file scan exited ${res.code}: ${res.out.trim().slice(0, 200)}`,
  )
}

console.log('\n▶ the guard does not report itself')

{
  /*
   * THE PLANTED CONTENT HAS TO ACTUALLY MATCH, and the first version of this
   * case did not. It wrote the guard's own `SIGNATURES` array as a fixture,
   * reasoning that a file naming both patterns would be a hit — but
   * `data-testid=["'][^"']*-DISABLED["']` written as SOURCE contains `[` where
   * the pattern wants a quote, and `#)\s*BROKEN:` puts `)` where it wants
   * whitespace. Neither regex matched, so the case passed with the exclusion
   * DELETED and proved nothing about it.
   *
   * A bare `// BROKEN:` line matches for certain, so this fixture genuinely
   * contains what the guard looks for — and the tree still comes back clean.
   * WHICH TURNED OUT NOT TO BE THE EXCLUSION'S DOING; see the case below.
   */
  const res = plant({
    ...CLEAN,
    'scripts/check-no-break-patches.mjs': '// BROKEN: the guard names its own patterns\n',
  })
  chk(
    res.code === 0,
    'its own source, which has to contain what it looks for, is not a hit',
    `the guard reported itself and exited ${res.code}`,
  )
  /*
   * AND THE REASON IT IS NOT A HIT IS THE SCOPE, NOT THE EXCLUSION. Mutating
   * the `path.resolve(full) !== SELF` test to `true` changed no answer, which
   * is how the exclusion turned out to be dead: `ROOTS` is `apps`, `packages`
   * and `test`, so `scripts/` is never walked and the comparison can never be
   * true.
   *
   * Pinned as its own case, because it is a DECISION about what the guard
   * covers — break patches edit `apps/**` and `packages/**`, and suites live
   * under `test/**` — and not an accident to inherit. Widening `ROOTS` to
   * include `scripts` fails this case, which is the right moment to notice that
   * the exclusion becomes load-bearing and that THIS file plants `// BROKEN:`
   * fixtures on purpose.
   */
  const scoped = plant({
    ...CLEAN,
    'scripts/anything-at-all.ts': '// BROKEN: a signature in a directory outside the scan\n',
  })
  chk(
    scoped.code === 0 && /3 file\(s\) read/.test(scoped.out),
    '`scripts/` is outside the scan by decision, and the three roots are what "clean" covers',
    `a signature under scripts/ changed the answer: exit ${scoped.code}, ` +
      `${JSON.stringify(scoped.out.trim().slice(0, 160))}`,
  )
}

console.log('\n▶ and it does not care where it was run from — which is the defect it had')

{
  /*
   * NO `BREAK_SCAN_ROOT` HERE, deliberately. The env var is what lets every
   * case above plant into a throwaway tree, and it is also what would HIDE a
   * return to relative roots: it wins the `??`, so a planted run never touches
   * the resolution this case is about. So this one runs the real guard over the
   * real tree from a foreign working directory. Relative roots make all three
   * miss from there, which is now a failure rather than a silent clean pass.
   */
  const { BREAK_SCAN_ROOT: _drop, ...env } = process.env
  const r = spawnSync(process.execPath, [GUARD], { encoding: 'utf8', cwd: tmpdir(), env })
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  const count = Number(out.match(/clean — ([\d]+) file\(s\) read/)?.[1] ?? 0)
  chk(
    r.status === 0 && count >= 2000,
    `run from outside the repository it still reads the whole tree (${count} files)`,
    `from ${tmpdir()} it exited ${r.status} having read ${count} file(s): ` +
      `${out.trim().slice(0, 200)}`,
  )
}

console.log(
  `\n${fail === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} patch-guard: ` +
    `${pass} case(s) held, ${fail} did not`,
)

/*
 * AND THAT EACH CASE BITES. Seven mutations of the guard, each of which has to
 * redden a case above.
 *
 * `path.resolve(full) !== SELF` IS NOT IN THE LIST, and that is a finding
 * rather than an omission. Replacing it with `true` changes no answer, because
 * `ROOTS` never walks `scripts/` — the exclusion is dead code. It is kept, with
 * the reason in the guard's own comment, and the scope it depends on is pinned
 * by the case above instead. A mutation that cannot change an answer is not a
 * mutation worth running; it is a line worth explaining.
 */
if (process.argv.includes('--mutate')) {
  const ORIGINAL = readFileSync(GUARD, 'utf8')
  const MUTATIONS = [
    [
      'the roots go back to being relative',
      "path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')",
      "'.'",
    ],
    ['a missing root is skipped silently again', 'if (missing.length) {', 'if (false) {'],
    ['the file-count floor is dropped', 'if (scanned < MIN_SCANNED) {', 'if (false) {'],
    [
      'the count leaves the clean message',
      '`[break-patch-check] clean — ${scanned} file(s) read across apps, packages and test, ` +',
      '`[break-patch-check] clean — no signatures across apps, packages and test` + ``.concat(',
    ],
    ['the -DISABLED pattern is dropped', 'data-testid=["\'][^"\']*-DISABLED["\']', 'data-testid=["\']__never__["\']'],
    ['the BROKEN: pattern is dropped', '(\\/\\/|\\/\\*|#)\\s*BROKEN:', '(\\/\\/|\\/\\*|#)\\s*__NEVER__:'],
    [
      'only the first root is walked',
      'for (const root of ROOTS) if (fs.existsSync(root)) walk(root)',
      'walk(ROOTS[0])',
    ],
  ]
  console.log('\n▶ and each mutation of the guard reddens a case')
  let blind = 0
  for (const [label, from, to] of MUTATIONS) {
    if (ORIGINAL.split(from).length - 1 !== 1) {
      console.log(`  \x1b[31mANCHOR MISS\x1b[0m ${label}`)
      blind += 1
      continue
    }
    writeFileSync(GUARD, ORIGINAL.split(from).join(to))
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8' })
    writeFileSync(GUARD, ORIGINAL)
    const named = (r.stdout ?? '').split('\n').filter((l) => l.includes('FAIL')).length
    if (r.status === 0) {
      console.log(`  \x1b[31mPROVES NOTHING\x1b[0m ${label} — every case still passes`)
      blind += 1
    } else {
      console.log(`  \x1b[32mreddens\x1b[0m ${label} (${named} case(s))`)
    }
  }
  writeFileSync(GUARD, ORIGINAL)
  console.log(
    `\n${blind === 0 ? '\x1b[32mok\x1b[0m' : '\x1b[31mnot ok\x1b[0m'} mutations: ` +
      `${MUTATIONS.length - blind} of ${MUTATIONS.length} bite`,
  )
  if (blind) fail += blind
}
if (fail) {
  console.error(`\n[patch-guard] ${fail} case(s) did not hold:`)
  for (const f of failures) console.error(`  · ${f}`)
}
process.exit(fail === 0 ? 0 : 1)
