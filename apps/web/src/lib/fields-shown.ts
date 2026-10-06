/**
 * HOW MANY OF A LIST'S FIELDS ARE SHOWN: those whose own id is not hidden.
 *
 * The list page keeps one hidden set for both the built-in columns the Columns
 * panel hides (`col:due`, …) and the fields the Fields picker hides, and the
 * Fields chip read `fields.length - hidden.size`, so it counted a hidden column
 * as a hidden field: hiding Due made it read 1/2 while both fields still
 * showed, and hiding every built-in column made it −3/2 on Table
 * (`found-30-sep/fields-picker-counts-hidden-columns`). The Columns panel's own
 * line counted the fields themselves, and was right; both ask this now.
 */
export function shownFieldCount(fields: readonly { id: string }[], hidden: ReadonlySet<string>): number {
  return fields.filter((f) => !hidden.has(f.id)).length
}
