import assert from 'node:assert/strict'
import { describe, it, test } from 'node:test'
import { parseFormula, evaluateFormula, toFormulaConfig, FormulaError, compileFormula, renameInFormula, FIELD_ID_REF } from './formula'

/**
 * 0158 — the parts of a formula field with edges, away from the database.
 *
 * The e2e suite proves the type round-trips through Postgres and draws. These
 * are the cases that are tedious to reach through a browser and easy to get
 * silently wrong: precedence, a missing input, and every way an expression can
 * be refused.
 */

const noFields = () => null
const fields = (m: Record<string, number | null>) => (name: string) =>
  Object.prototype.hasOwnProperty.call(m, name) ? m[name]! : null

test('parse reports the fields an expression reads, once each', () => {
  assert.deepEqual(parseFormula('{Budget} - {Spent} + {Budget}').refs, ['Budget', 'Spent'])
  assert.deepEqual(parseFormula('1 + 2').refs, [])
})

test('an expression that cannot be evaluated is refused, not stored', () => {
  for (const bad of ['', '   ', '1 +', '1 + + ', '(1 + 2', '{Budget', '1 2', '1 & 2', '{}', '1..2']) {
    assert.throws(() => parseFormula(bad), FormulaError, `"${bad}" should not parse`)
  }
  assert.throws(() => parseFormula(42 as unknown), FormulaError)
  assert.throws(() => parseFormula('1' + '+1'.repeat(400)), FormulaError)
})

test('precedence and parentheses, because getting these wrong is invisible', () => {
  assert.equal(evaluateFormula('2 + 3 * 4', noFields), 14)
  assert.equal(evaluateFormula('(2 + 3) * 4', noFields), 20)
  assert.equal(evaluateFormula('10 - 2 - 3', noFields), 5)
  assert.equal(evaluateFormula('-4 + 10', noFields), 6)
  assert.equal(evaluateFormula('100 / 8', noFields), 12.5)
})

test('a missing input makes the whole result null, never zero', () => {
  assert.equal(evaluateFormula('{Spent} / {Budget} * 100', fields({ Spent: 50, Budget: 200 })), 25)
  assert.equal(evaluateFormula('{Spent} / {Budget} * 100', fields({ Spent: 50, Budget: null })), null)
  assert.equal(evaluateFormula('{Spent} + 1', fields({})), null)
  // Zero is a real number and must survive; only the ABSENCE of one is null.
  assert.equal(evaluateFormula('{Spent} + 1', fields({ Spent: 0 })), 1)
})

test('dividing by zero has no answer, so it says so', () => {
  assert.equal(evaluateFormula('{Spent} / {Budget}', fields({ Spent: 50, Budget: 0 })), null)
  assert.equal(evaluateFormula('1 / 0', noFields), null)
})

test('two decimals, so a cell does not render floating-point noise', () => {
  assert.equal(evaluateFormula('0.1 + 0.2', noFields), 0.3)
  assert.equal(evaluateFormula('{A} / 3', fields({ A: 1 })), 0.33)
})

test('a stored expression that no longer parses reads as null rather than throwing', () => {
  assert.equal(evaluateFormula('1 +', noFields), null)
  assert.equal(toFormulaConfig(null).expression, '')
  assert.equal(toFormulaConfig({ expression: 7 }).expression, '')
  assert.equal(toFormulaConfig({ expression: '{A}' }).expression, '{A}')
})

/*
 * A FORMULA READS A FIELD, NOT ITS NAME (`found-6-oct/field-checks-name-a-private-lists-fields`).
 * A rename was refused while a formula read the field, naming the formula to a
 * member who could not open the private list it was kept to. A formula keeps
 * each field's id beside what it shows, and a rename rewrites what it shows.
 */
describe('a formula names its fields by id, and a rename rewrites what it shows', () => {
  const B = '11111111-1111-4111-8111-111111111111'
  const C = '22222222-2222-4222-8222-222222222222'
  it('compiles each reference, however it is spaced, to its field’s id, and evaluates by them', () => {
    const compiled = compileFormula('{Budget} * 2 + { Cost }', (name) => (name === 'Budget' ? B : C))
    assert.equal(compiled, `{#${B}} * 2 + {#${C}}`)
    assert.equal(evaluateFormula(compiled, (ref) => ({ [B]: 10, [C]: 1 } as Record<string, number>)[FIELD_ID_REF.exec(ref)?.[1] ?? ''] ?? null), 21)
  })
  it('a rename writes the new name over every reference to that field, and over no other, even one of the same name', () => {
    const cfg = { expression: '{Budget} * 2 + {Budget} - { Budget }', compiled: `{#${B}} * 2 + {#${B}} - {#${C}}` }
    assert.equal(renameInFormula(cfg, B, 'Budget (USD)'), '{Budget (USD)} * 2 + {Budget (USD)} - { Budget }')
    assert.equal(renameInFormula(cfg, C, 'Other'), '{Budget} * 2 + {Budget} - {Other}')
    // Saved before ids were kept, or shown and compiled out of step: left as it is.
    assert.equal(renameInFormula({ expression: '{Budget} + 1' }, B, 'New'), '{Budget} + 1')
    assert.equal(renameInFormula({ expression: '{Budget} + {Cost}', compiled: `{#${B}} + 1` }, B, 'New'), '{Budget} + {Cost}')
  })
})
