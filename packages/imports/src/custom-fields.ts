/**
 * §2.5 — Custom Field types the spreadsheet importer can fill, and the ones it
 * shows as "Not supported for import". Keys are RUNDESK's own field types
 * (`custom_field_type` in packages/db), labels are the spec's names.
 */

import { parseImportDate, type DateFormatKey } from './dates'
import {
  parseCheckbox,
  parseEmail,
  parseMoney,
  parseNumber,
  parsePhone,
  parseProgress,
  parseRating,
  parseWebsite,
  splitMulti,
  type Parsed,
} from './values'

export type ImportableFieldType =
  | 'text'
  | 'long_text'
  | 'checkbox'
  | 'number'
  | 'money'
  | 'date'
  | 'dropdown'
  | 'labels'
  | 'email'
  | 'phone'
  | 'url'
  | 'rating'
  | 'progress_manual'

/** Offered on the Custom Fields screen's "Data Type" dropdown, in this order. */
export const IMPORTABLE_FIELD_TYPES: ReadonlyArray<{ type: ImportableFieldType; label: string }> = [
  { type: 'text', label: 'Text' },
  { type: 'long_text', label: 'Text area' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'number', label: 'Number' },
  { type: 'money', label: 'Money' },
  { type: 'date', label: 'Date' },
  { type: 'dropdown', label: 'Dropdown' },
  { type: 'labels', label: 'Labels' },
  { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone' },
  { type: 'url', label: 'Website' },
  { type: 'rating', label: 'Rating' },
  { type: 'progress_manual', label: 'Progress (Manual)' },
]

/** Shown disabled with "Not supported for import". Field types with no RUNDESK twin are named only. */
export const UNSUPPORTED_FIELD_TYPES: ReadonlyArray<{ type: string; label: string }> = [
  { type: 'button', label: 'Button' },
  { type: 'files', label: 'Files' },
  { type: 'formula', label: 'Formula' },
  { type: 'location', label: 'Location' },
  { type: 'people', label: 'People' },
  { type: 'progress_auto', label: 'Progress (Auto)' },
  { type: 'tasks', label: 'Relationships' },
  { type: 'rollup', label: 'Rollup' },
  { type: 'signature', label: 'Signature' },
  { type: 'task_links', label: 'Task links' },
  { type: 'voting', label: 'Voting' },
]

export const NOT_SUPPORTED_FOR_IMPORT = 'Not supported for import'

export const TEXT_MAX = 2_048
export const TEXT_AREA_MAX = 50_000

export function isImportableFieldType(type: string): type is ImportableFieldType {
  return IMPORTABLE_FIELD_TYPES.some((t) => t.type === type)
}

/**
 * A parsed cell, before the writer resolves option labels to option values.
 * Dropdown and Labels carry LABELS here: the writer creates any missing option
 * ("create options on the fly") and stores the option's value.
 */
export type CustomCellValue = string | number | boolean | string[]

export function parseCustomCell(
  type: ImportableFieldType,
  raw: string,
  opts: { dateFormat: DateFormatKey; delimiter: string },
): Parsed<CustomCellValue> {
  const v = raw.trim()
  switch (type) {
    case 'text':
      return v.length > TEXT_MAX
        ? { ok: false, message: `Text fields hold up to ${TEXT_MAX.toLocaleString('en-GB')} characters (this has ${v.length}).` }
        : { ok: true, value: v }
    case 'long_text':
      return raw.length > TEXT_AREA_MAX
        ? { ok: false, message: `Text area fields hold up to ${TEXT_AREA_MAX.toLocaleString('en-GB')} characters.` }
        : { ok: true, value: raw }
    case 'checkbox':
      return parseCheckbox(v)
    case 'number':
      return parseNumber(v)
    case 'money':
      return parseMoney(v)
    case 'date': {
      const d = parseImportDate(v, opts.dateFormat)
      return d.ok ? { ok: true, value: new Date(d.ms).toISOString() } : d
    }
    case 'dropdown':
      return { ok: true, value: v }
    case 'labels':
      return { ok: true, value: [...new Set(splitMulti(v, opts.delimiter))] }
    case 'email':
      return parseEmail(v)
    case 'phone':
      return parsePhone(v)
    case 'url':
      return parseWebsite(v)
    case 'rating':
      return parseRating(v)
    case 'progress_manual':
      return parseProgress(v)
  }
}

/**
 * A starting type for "Add as new custom field", from the column's values.
 * The person can change it; this only saves them choosing the obvious one.
 */
export function suggestFieldType(values: string[], opts: { dateFormat: DateFormatKey; delimiter: string }): ImportableFieldType {
  const sample = values.map((v) => v.trim()).filter(Boolean).slice(0, 200)
  if (sample.length === 0) return 'text'
  const all = (type: ImportableFieldType) => sample.every((v) => parseCustomCell(type, v, opts).ok)
  if (all('checkbox') && sample.some((v) => !/^\d+$/.test(v))) return 'checkbox'
  if (all('number')) return 'number'
  if (sample.every((v) => /^[^\d-]\s?-?[\d,]+(\.\d+)?$/.test(v)) && all('money')) return 'money'
  if (all('date')) return 'date'
  if (all('email')) return 'email'
  if (all('url')) return 'url'
  const distinct = new Set(sample.map((v) => v.toLowerCase()))
  if (distinct.size <= 20 && distinct.size < sample.length && Math.max(...sample.map((v) => v.length)) <= 64) {
    return 'dropdown'
  }
  if (sample.some((v) => v.length > TEXT_MAX || v.includes('\n'))) return 'long_text'
  return 'text'
}
