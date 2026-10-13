#!/usr/bin/env node
/*
 * THE PLACEHOLDER GATE, ON PLANTED CATALOGUES.
 *
 * Each case plants a catalogue and runs the gate on it: a clean one passes; a
 * `{name}` fails, named with its locale and key (the `superAgents.madeBy`
 * miss); a formula key's own braces pass; a translation that drops a
 * `{{count}}` fails, and one that renames it; a file with no English strings
 * fails rather than passing. `--mutate` breaks the gate one rule at a time.
 *
 *   node scripts/check-i18n-placeholders-cases.mjs [--mutate]
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = process.env.GATE_UNDER_TEST ?? join(HERE, 'check-i18n-placeholders.mjs')

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

const catalogue = (en, es) => [
  'export const en = {',
  ...Object.entries(en).map(([k, v]) => `  '${k}': '${v}',`),
  '} as const',
  '',
  'export const es: Record<TranslationKey, string> = {',
  ...Object.entries(es).map(([k, v]) => `  '${k}': '${v}',`),
  '}',
  '',
].join('\n')
const run = (text) => {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-ph-'))
  try {
    const file = join(dir, 'catalogs.ts')
    writeFileSync(file, text)
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', env: { ...process.env, CATALOGS: file } })
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const EN = { 'a.made': 'Made by {{name}}', 'a.count': '{{count}} slides', 'taskDetail.newFieldExpression': 'Expression, e.g. {Budget} - {Spent}' }
const ES = { 'a.made': 'Creado por {{name}}', 'a.count': '{{count}} diapositivas', 'taskDetail.newFieldExpression': 'Expresión, p. ej. {Budget} - {Spent}' }

console.log('▶ what the gate must pass')
{
  const r = run(catalogue(EN, ES))
  chk(r.code === 0 && /ok — 6 string\(s\) in 2 locale\(s\)/.test(r.out), 'a catalogue whose placeholders are all {{one}}, the same in each locale, passes', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = run(catalogue(EN, ES))
  chk(r.code === 0 && !/Budget/.test(r.out), 'a formula key\'s own braces are its syntax, not a placeholder', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = run(catalogue({ ...EN, 'a.tasks_one': '{{count}} task in {{list}}' }, { ...ES, 'a.tasks_one': 'Una tarea en {{list}}' }))
  chk(r.code === 0, 'a singular form may say its number in its word and leave out {{count}}, as Arabic\'s do', `it exited ${r.code}: ${r.out.trim()}`)
}
console.log('\n▶ what the gate must find')
{
  const r = run(catalogue({ ...EN, 'a.made': 'Made by {name}' }, { ...ES, 'a.made': 'Creado por {name}' }))
  chk(r.code === 1 && /en: a\.made writes \{name\}, which the translator does not fill — write \{\{name\}\}/.test(r.out) && /es: a\.made writes \{name\}/.test(r.out), 'a {name} is a failure, named with its locale and key, in each locale that writes it (the superAgents.madeBy miss)', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = run(catalogue({ ...EN, 'b.other': 'Delete {thing}?' }, { ...ES, 'b.other': 'Delete {{thing}}?' }))
  chk(r.code === 1 && /en: b\.other writes \{thing\}/.test(r.out), 'a single-braced word in any other key fails too — only the formula keys are let through', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = run(catalogue(EN, { ...ES, 'a.count': 'diapositivas' }))
  chk(r.code === 1 && /es: a\.count fills \{\{—\}\} where English fills \{\{count\}\}/.test(r.out), 'a translation that drops a {{count}} fails', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = run(catalogue(EN, { ...ES, 'a.count': '{{cuenta}} diapositivas' }))
  chk(r.code === 1 && /es: a\.count fills \{\{cuenta\}\} where English fills \{\{count\}\}/.test(r.out), 'and one that renames it fails — it would print itself', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = run(catalogue({ ...EN, 'a.tasks_one': '{{count}} task in {{list}}' }, { ...ES, 'a.tasks_one': 'Una tarea' }))
  chk(r.code === 1 && /es: a\.tasks_one fills \{\{—\}\} where English fills \{\{list\}\}/.test(r.out), 'but a singular form that leaves out anything else fails', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = run(catalogue({ ...EN, 'a.made': 'Made by {{name}}' }, { ...ES, 'a.made': 'Creado por {{name}} y {{count}}' }))
  chk(r.code === 1 && /es: a\.made fills \{\{count,name\}\} where English fills \{\{name\}\}/.test(r.out), 'and a translation that adds one English does not fill fails', `it exited ${r.code}: ${r.out.trim()}`)
}
{
  const r = run('export const other = {\n}\n')
  chk(r.code === 1 && /no English strings were read/.test(r.out), 'a file with no English strings is a failure, not a pass', `it exited ${r.code}: ${r.out.trim()}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.GATE_UNDER_TEST) {
  const alive = (mutant) => {
    const r = spawnSync(process.execPath, [mutant], { encoding: 'utf8' })
    return { ok: /ok —|✗/.test(`${r.stdout ?? ''}`), why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: GATE,
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'GATE_UNDER_TEST',
    label: 'the gate',
    alive,
    mutations: [
      ['problems-pass', '  process.exitCode = 1\n', '  process.exitCode = 0\n'],
      ['one-brace-unread', "      for (const m of value.matchAll(ONE)) problems.push(", "      for (const m of [].values()) problems.push("],
      ['every-key-literal', '    if (!LITERAL.has(key)) {', '    if (false) {'],
      ['no-literal-keys', "const LITERAL = new Set(['taskDetail.newFieldExpression', 'quickCreate.fieldExpressionPlaceholder'])", 'const LITERAL = new Set()'],
      ['locales-unchecked', "    if (locale !== 'en' && en?.has(key)) {", '    if (false) {'],
      // How many, not which: a renamed placeholder counts the same.
      ['names-not-compared', "const words = (value) => [...value.matchAll(TWO)].map((m) => m[1]).sort().join(',')", "const words = (value) => String([...value.matchAll(TWO)].length)"],
      ['empty-passes', 'if (!en || en.size === 0) problems.push(', 'if (false) problems.push('],
      ['plural-forms-unforgiven', "      if (PLURAL_FORM.test(key) && !value.includes('{{count}}')) want =", "      if (false) want ="],
      ['plural-forms-forgive-all', "want = want.split(',').filter((w) => w && w !== 'count').join(',')", "want = have"],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
