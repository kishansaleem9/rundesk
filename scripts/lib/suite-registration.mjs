/*
 * WHICH E2E SUITES CI ACTUALLY RUNS — read from the `run:` values, not from
 * the file as a whole.
 *
 * `doc-import.mjs` sat outside ci.yml while the resume doc said "ALL 113 are
 * registered", and nothing compared the two lists: the suite directory and the
 * workflow were each right on their own terms. `local-sweep.mjs` derives its
 * suite list FROM ci.yml, so it missed the same suite, silently. This module is
 * the comparison; `check-suites-registered.mjs` is the gate that uses it.
 *
 * WHAT COUNTS AS REGISTERED is `node test/e2e/<name>.mjs` inside a step's
 * `run:` — inline, or in a `run: |` block — on a line that is not a comment.
 * A suite mentioned in a YAML comment, in a step's `name:`, or behind a shell
 * `#` is run by nothing, and grepping the whole file would count all three.
 *
 * No YAML parser resolves from the repository root, so the `run:` values are
 * found by indentation, which is all a block scalar is: it starts after `|` or
 * `>` and ends at the first non-blank line indented no deeper than its key.
 *
 * Pure, so `check-suites-registered-cases.mjs` can plant workflows and mutate
 * this file without touching the real one.
 */

const RUN_KEY = /^(\s*)(?:-\s+)?run:\s*(.*)$/
const BLOCK_SCALAR = /^[|>][+-]?\s*(#.*)?$/
const INVOCATION = /\bnode\s+test\/e2e\/([A-Za-z0-9._-]+)\.mjs\b/g

/** Every line a step would execute, comments removed. */
export function runLines(ciText) {
  const lines = ciText.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i += 1) {
    const m = RUN_KEY.exec(lines[i])
    if (!m) continue
    const [, indent, rest] = m
    if (!BLOCK_SCALAR.test(rest)) {
      out.push(rest)
      continue
    }
    let j = i + 1
    for (; j < lines.length; j += 1) {
      const l = lines[j]
      if (l.trim() === '') continue
      if (l.length - l.trimStart().length <= indent.length) break
      out.push(l)
    }
    i = j - 1
  }
  return out.filter((l) => !l.trimStart().startsWith('#'))
}

/** The suite names CI invokes, as a Set of file stems. */
export function registeredSuites(ciText) {
  const names = new Set()
  for (const line of runLines(ciText)) {
    for (const m of line.matchAll(INVOCATION)) names.add(m[1])
  }
  return names
}
