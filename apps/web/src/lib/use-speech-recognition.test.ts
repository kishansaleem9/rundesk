/**
 * Unit test for the pure `localeToSpeechLang` mapping (Plan §15.2).
 *
 * Written as a tiny tsx-runnable assertion script (throws → non-zero exit) rather
 * than using `node:test`, on purpose: the web `tsconfig` sets
 * `types: ["vite/client"]`, so pulling `@types/node` in here (needed for
 * `node:test`) would leak Node globals into the whole app's typecheck and flip
 * DOM types like `setTimeout`'s return. Only `console` (a DOM global) is used.
 *
 * Run:  pnpm --dir ../.. exec tsx apps/web/src/lib/use-speech-recognition.test.ts
 *   or: node_modules/.bin/tsx apps/web/src/lib/use-speech-recognition.test.ts
 */
import { localeToSpeechLang, DEFAULT_SPEECH_LANG } from './use-speech-recognition'

const failures: string[] = []

function expectEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    failures.push(`${label}: expected "${expected}", got "${actual}"`)
  }
}

// Every supported app locale maps to its BCP-47 speech language.
expectEqual(localeToSpeechLang('en'), 'en-US', "locale 'en'")
expectEqual(localeToSpeechLang('es'), 'es-ES', "locale 'es'")
expectEqual(localeToSpeechLang('ar'), 'ar-SA', "locale 'ar'")
expectEqual(localeToSpeechLang('ur'), 'ur-PK', "locale 'ur'")

// Unknown / empty / non-locale strings fall back to the default.
expectEqual(localeToSpeechLang(undefined), DEFAULT_SPEECH_LANG, 'undefined')
expectEqual(localeToSpeechLang(null), DEFAULT_SPEECH_LANG, 'null')
expectEqual(localeToSpeechLang(''), DEFAULT_SPEECH_LANG, 'empty string')
expectEqual(localeToSpeechLang('fr'), DEFAULT_SPEECH_LANG, "unknown locale 'fr'")
expectEqual(localeToSpeechLang('en-US'), DEFAULT_SPEECH_LANG, 'BCP-47 tag (not an app locale)')
// Guards against prototype keys leaking through the lookup.
expectEqual(localeToSpeechLang('toString'), DEFAULT_SPEECH_LANG, "prototype key 'toString'")
expectEqual(localeToSpeechLang('hasOwnProperty'), DEFAULT_SPEECH_LANG, "prototype key 'hasOwnProperty'")
// Case-sensitive by design (locales are lower-case).
expectEqual(localeToSpeechLang('EN'), DEFAULT_SPEECH_LANG, "upper-case 'EN'")

if (failures.length > 0) {
  throw new Error(`localeToSpeechLang: ${failures.length} case(s) failed:\n- ${failures.join('\n- ')}`)
}

console.log('localeToSpeechLang: all 12 cases passed')
