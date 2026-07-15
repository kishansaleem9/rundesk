import { catalogs, RTL_LOCALES, type Locale } from './catalogs'

export type Direction = 'ltr' | 'rtl'
export type Vars = Record<string, string | number>

/** Replace {{name}} placeholders; unknown placeholders are left intact. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{{${k}}}`))
}

/** Resolve a key for a locale, falling back to English, then the key itself. */
export function translate(locale: Locale, key: string, vars?: Vars): string {
  const cat = catalogs[locale] as Record<string, string>
  const template = cat[key] ?? (catalogs.en as Record<string, string>)[key] ?? key
  return interpolate(template, vars)
}

/** Pluralized lookup: `${base}_one` for count===1, else `${base}_other`. */
export function translateCount(locale: Locale, base: string, count: number, vars?: Vars): string {
  const suffix = count === 1 ? '_one' : '_other'
  return translate(locale, `${base}${suffix}`, { ...vars, count })
}

export function directionFor(locale: Locale): Direction {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr'
}

export const SUPPORTED_LOCALES = Object.keys(catalogs) as Locale[]

export function isSupportedLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (SUPPORTED_LOCALES as string[]).includes(v)
}
