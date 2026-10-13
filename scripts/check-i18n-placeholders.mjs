#!/usr/bin/env node
/*
 * EVERY PLACEHOLDER A CATALOGUE WRITES IS ONE THE TRANSLATOR FILLS
 * (`found-13-oct/single-brace-placeholders-print-themselves`).
 *
 * `translate.ts` fills `{{name}}` and nothing else, so a string written with
 * `{name}` is shown with its braces: a Super Agent's card read "Made by
 * {name}", its delete prompt "Delete {name}?", and a checklist item's assign
 * button told a screen reader "Assignee for {item}" — in all four locales.
 * Held to two rules, over every string of every catalogue:
 *
 *   one brace     no `{word}` in any string, but for the keys whose braces are
 *                 the product's own syntax (a formula's field names, `LITERAL`)
 *   same words    each key's `{{…}}` are the same in every locale as in
 *                 English: a translation that drops one says less, and one
 *                 that renames one prints it. A singular, dual or zero form
 *                 (`_one`, `_two`, `_zero`) may leave out `{{count}}` — Arabic
 *                 says "one task" in its word, not its numeral — and nothing else
 *
 * A catalogue read as nothing is a failure, not a pass.
 *
 *   node scripts/check-i18n-placeholders.mjs        (CATALOGS=<file> to read another)
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = process.env.CATALOGS ?? join(HERE, '..', 'apps', 'web', 'src', 'lib', 'i18n', 'catalogs.ts')
/** Strings whose braces are what the person types: a formula names its fields `{Budget}`. */
const LITERAL = new Set(['taskDetail.newFieldExpression', 'quickCreate.fieldExpressionPlaceholder'])

const src = readFileSync(FILE, 'utf8')
const ENTRY = /^\s+(['"])((?:\\.|(?!\1).)+)\1:\s*(['"])((?:\\.|(?!\3).)*)\3,?\s*$/
const locales = new Map()
let current = null
for (const line of src.split('\n')) {
  // A catalogue: English, which the others are typed against, and each `Record<TranslationKey, string>`.
  const head = /^export const (\w+)(?:: Record<TranslationKey, string>)? = \{\s*$/.exec(line)
  if (head) {
    current = new Map()
    locales.set(head[1], current)
    continue
  }
  if (current && /^\}/.test(line)) {
    current = null
    continue
  }
  const m = current && ENTRY.exec(line)
  if (m) current.set(m[2], m[4])
}

const problems = []
const en = locales.get('en')
if (!en || en.size === 0) problems.push(`no English strings were read from ${FILE}: nothing was checked`)
const ONE = /(?<!\{)\{([A-Za-z_]\w*)\}(?!\})/g
const TWO = /\{\{(\w+)\}\}/g
const words = (value) => [...value.matchAll(TWO)].map((m) => m[1]).sort().join(',')
const PLURAL_FORM = /_(zero|one|two)$/
let strings = 0
for (const [locale, entries] of locales) {
  for (const [key, value] of entries) {
    strings += 1
    if (!LITERAL.has(key)) {
      for (const m of value.matchAll(ONE)) problems.push(`${locale}: ${key} writes {${m[1]}}, which the translator does not fill — write {{${m[1]}}}`)
    }
    if (locale !== 'en' && en?.has(key)) {
      let want = words(en.get(key))
      const have = words(value)
      if (PLURAL_FORM.test(key) && !value.includes('{{count}}')) want = want.split(',').filter((w) => w && w !== 'count').join(',')
      if (have !== want) problems.push(`${locale}: ${key} fills {{${have || '—'}}} where English fills {{${want || '—'}}}`)
    }
  }
}

if (problems.length) {
  console.log(`✗ ${problems.length} placeholder problem(s) in ${FILE}:`)
  for (const p of problems) console.log(`  ${p}`)
  process.exitCode = 1
} else {
  console.log(`ok — ${strings} string(s) in ${locales.size} locale(s): every placeholder is {{one}} the translator fills, the same in each locale`)
}
