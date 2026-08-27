/**
 * §G15 [22:28] — what counts as a table, and what does not.
 *
 * The renderer's new blocks are mostly JSX, which this runner cannot mount.
 * The part worth testing without a DOM is the parsing decision underneath:
 * whether two lines begin a table, how a row splits into cells, and — the one
 * that actually bites — whether an ordinary sentence containing a pipe gets
 * silently turned into a one-column table.
 */
import assert from 'node:assert/strict'
import { TABLE_DIVIDER, startsTable, tableCells, hasBlockMarkdown } from './markdown'

let checks = 0
const ok = (cond: boolean, label: string) => {
  checks++
  assert.ok(cond, label)
}

// ── the delimiter row ───────────────────────────────────────────────────────
ok(TABLE_DIVIDER.test('| --- | --- |'), 'a plain delimiter row is one')
ok(TABLE_DIVIDER.test('|---|---|'), 'without spaces too')
ok(TABLE_DIVIDER.test('| :--- | ---: | :---: |'), 'alignment colons are allowed')
ok(TABLE_DIVIDER.test('--- | ---'), 'outer pipes are optional')
ok(!TABLE_DIVIDER.test('| a | b |'), 'a content row is not a delimiter')
ok(!TABLE_DIVIDER.test('| -- x -- |'), 'text among the dashes is not a delimiter')

// ── what begins a table ─────────────────────────────────────────────────────
ok(startsTable('| Name | Owner |', '| --- | --- |'), 'header + delimiter begins a table')
ok(!startsTable('| Name | Owner |', 'just some text'), 'a header with no delimiter does not')
ok(!startsTable('| Name | Owner |', undefined), 'nor does a header at the end of the document')

/*
 * The false positive this exists to prevent.
 *
 * "ship it | or don't" is a sentence. Before requiring the delimiter row, a
 * naive "does this line contain a pipe" check turned every such line into a
 * one-column table — which is a worse outcome than leaving it as text, because
 * the reader cannot tell what happened to their sentence.
 */
ok(!startsTable("ship it | or don't", 'and then we ship'), 'a sentence with a pipe stays a sentence')
ok(!startsTable('a|b', 'c|d'), 'two pipe-ish lines are not a table without a delimiter')

// ── cells ───────────────────────────────────────────────────────────────────
assert.deepEqual(tableCells('| a | b |'), ['a', 'b'])
checks++
assert.deepEqual(tableCells('a | b'), ['a', 'b'], 'outer pipes are optional')
checks++
assert.deepEqual(tableCells('|  spaced  |  out  |'), ['spaced', 'out'], 'cells are trimmed')
checks++
assert.deepEqual(tableCells('| a |  | c |'), ['a', '', 'c'], 'an empty cell survives as empty')
checks++

// ── the cheap-path gate ─────────────────────────────────────────────────────
// hasBlockMarkdown decides whether chat can skip block rendering entirely. If
// it says no for a table, the table renders as a row of literal pipes.
ok(hasBlockMarkdown('| a | b |\n| --- | --- |'), 'a table needs block rendering')
ok(hasBlockMarkdown(':::note\nheads up\n:::'), 'a banner needs block rendering')
ok(hasBlockMarkdown('## heading'), 'a heading still does')
ok(!hasBlockMarkdown('just a normal sentence'), 'an ordinary line still takes the cheap path')
ok(!hasBlockMarkdown('email me at a@b.c'), 'and so does one with punctuation in it')

console.log(`  ${checks} checks passed`)
