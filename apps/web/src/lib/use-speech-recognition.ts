/**
 * Push-to-talk speech-to-text via the browser-native Web Speech API (Plan §15.2).
 *
 * A small, reusable hook (`useSpeechRecognition`) plus a headless-ish `MicButton`
 * so the AI Commands flow and the AI chat composer can share one implementation.
 * No external STT infrastructure — everything runs in the browser using
 * `window.SpeechRecognition || window.webkitSpeechRecognition`.
 *
 * Authored as a `.ts` file (no JSX): the button is built with `React.createElement`
 * so the whole feature lives in one reusable module.
 */
import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { Mic, MicOff } from 'lucide-react'
import type { Locale } from './i18n/catalogs'

// ─── ambient Web Speech API types (Plan §15.2) ────────────────────────────────
// TS's bundled lib.dom (5.9) ships SpeechRecognitionResult/ResultList/Alternative
// but NOT the SpeechRecognition interface, its constructor, the event shapes, or
// the vendor-prefixed `webkitSpeechRecognition` global. We declare the minimal
// surface here (inline rather than a sibling .d.ts, which this repo .gitignores as
// a build artifact). These are type-only and fully erased at runtime.
declare global {
  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number
    readonly results: SpeechRecognitionResultList
  }

  interface SpeechRecognitionErrorEvent extends Event {
    /** e.g. 'not-allowed', 'no-speech', 'audio-capture', 'network', 'aborted'. */
    readonly error: string
    readonly message: string
  }

  interface SpeechRecognition extends EventTarget {
    /** BCP-47 language tag (e.g. 'en-US'). */
    lang: string
    continuous: boolean
    interimResults: boolean
    maxAlternatives: number
    start(): void
    stop(): void
    abort(): void
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null
    onend: ((this: SpeechRecognition, ev: Event) => unknown) | null
    onstart: ((this: SpeechRecognition, ev: Event) => unknown) | null
    onspeechend: ((this: SpeechRecognition, ev: Event) => unknown) | null
    onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null
  }

  type SpeechRecognitionConstructor = {
    prototype: SpeechRecognition
    new (): SpeechRecognition
  }

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

// ─── locale → BCP-47 speech language (pure, unit-tested) ──────────────────────

/**
 * Map the app locale (en/es/ar/ur) to a BCP-47 language tag the Web Speech API
 * understands. Typed as an exhaustive `Record<Locale, string>` so adding a new
 * app locale forces a mapping here (missing entry = compile error).
 */
const LOCALE_SPEECH_LANG: Record<Locale, string> = {
  en: 'en-US',
  es: 'es-ES',
  ar: 'ar-SA',
  ur: 'ur-PK',
}

/** Fallback speech language when the locale is unknown or unset. */
export const DEFAULT_SPEECH_LANG = 'en-US'

/**
 * Pure helper: resolve an app locale to a speech-recognition language tag.
 * Unknown / empty / non-string values fall back to {@link DEFAULT_SPEECH_LANG}.
 */
export function localeToSpeechLang(locale: string | null | undefined): string {
  if (
    typeof locale === 'string' &&
    Object.prototype.hasOwnProperty.call(LOCALE_SPEECH_LANG, locale)
  ) {
    return LOCALE_SPEECH_LANG[locale as Locale]
  }
  return DEFAULT_SPEECH_LANG
}

// ─── feature detection ────────────────────────────────────────────────────────

/** The vendor-agnostic SpeechRecognition constructor, or undefined if unsupported. */
function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

/** Whether this browser exposes the Web Speech API at all. */
export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== undefined
}

// ─── the hook ─────────────────────────────────────────────────────────────────

export type SpeechRecognitionErrorCode =
  | 'not-allowed'
  | 'service-not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'language-not-supported'
  | 'bad-grammar'
  | (string & {})

export type UseSpeechRecognitionOptions = {
  /** App locale; mapped to a BCP-47 speech language unless `lang` is provided. */
  locale?: Locale
  /** Explicit BCP-47 language override (wins over `locale`). */
  lang?: string
  /**
   * Keep recognizing across pauses. Default `false` = push-to-talk that
   * naturally ends on silence (and on an explicit stop/click).
   */
  continuous?: boolean
  /** Emit interim (non-final) hypotheses for a live transcript. Default `true`. */
  interimResults?: boolean
  /** Called with each finalized transcript chunk (trimmed, non-empty). */
  onResult?: (transcript: string) => void
}

export type SpeechRecognitionController = {
  /** Feature-detection result — false → hide/disable the mic. */
  supported: boolean
  /** True while actively recognizing. */
  listening: boolean
  /** Live, not-yet-final hypothesis for on-screen feedback. */
  interimTranscript: string
  /** Last meaningful error code ('no-speech'/'aborted' are ignored), else null. */
  error: SpeechRecognitionErrorCode | null
  start: () => void
  stop: () => void
  toggle: () => void
  /** Clear the interim transcript + error (e.g. after consuming a result). */
  reset: () => void
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): SpeechRecognitionController {
  const { locale, lang, continuous = false, interimResults = true, onResult } = options

  // Feature-detect once; supported browsers keep it stable for the mount.
  const [supported] = useState(isSpeechRecognitionSupported)
  const [listening, setListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<SpeechRecognitionErrorCode | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Keep the latest callback + language without re-creating `start`/handlers.
  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const resolvedLang = lang ?? localeToSpeechLang(locale)
  const langRef = useRef(resolvedLang)
  useEffect(() => {
    langRef.current = resolvedLang
  }, [resolvedLang])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!supported || recognitionRef.current) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    const recognition = new Ctor()
    recognition.lang = langRef.current
    recognition.continuous = continuous
    recognition.interimResults = interimResults
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          const finalText = transcript.trim()
          if (finalText) onResultRef.current?.(finalText)
        } else {
          interim += transcript
        }
      }
      setInterimTranscript(interim)
    }
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech'/'aborted' are benign lifecycle signals, not user-facing errors.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(event.error as SpeechRecognitionErrorCode)
      }
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
      setInterimTranscript('')
    }

    setError(null)
    setInterimTranscript('')
    try {
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    } catch {
      // start() throws if called while already started; treat as a no-op.
      recognitionRef.current = null
    }
  }, [supported, continuous, interimResults])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  const reset = useCallback(() => {
    setInterimTranscript('')
    setError(null)
  }, [])

  // Abort any in-flight recognition when the consumer unmounts.
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current
      if (rec) {
        rec.onend = null
        rec.onerror = null
        rec.onresult = null
        rec.abort()
        recognitionRef.current = null
      }
    }
  }, [])

  return { supported, listening, interimTranscript, error, start, stop, toggle, reset }
}

// ─── reusable mic button ──────────────────────────────────────────────────────

export type MicButtonProps = {
  controller: SpeechRecognitionController
  /** Pre-localized labels (accessible names + tooltips). */
  labels: { start: string; stop: string; unsupported: string }
  /** Button size. Default 'md' (h-10) aligns with the app's default Button. */
  size?: 'sm' | 'md'
  /** Externally disable (e.g. while an AI request is streaming). */
  disabled?: boolean
  className?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const MIC_BASE =
  'relative inline-flex items-center justify-center rounded-md shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/**
 * Accessible push-to-talk button. Native `<button>` → keyboard-triggerable.
 * Unsupported browsers render a disabled mic with an explanatory tooltip; while
 * recording it turns red with a pulsing ring and flips to `aria-pressed`.
 */
export function MicButton({
  controller,
  labels,
  size = 'md',
  disabled,
  className,
}: MicButtonProps): ReactElement {
  const { supported, listening, toggle } = controller
  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  if (!supported) {
    return createElement(
      'button',
      {
        type: 'button',
        disabled: true,
        title: labels.unsupported,
        'aria-label': labels.unsupported,
        className: joinClasses(
          MIC_BASE,
          box,
          'text-muted-foreground opacity-50 cursor-not-allowed',
          className,
        ),
      },
      createElement(MicOff, { className: iconSize, 'aria-hidden': true }),
    )
  }

  const label = listening ? labels.stop : labels.start
  return createElement(
    'button',
    {
      type: 'button',
      disabled,
      onClick: disabled ? undefined : toggle,
      title: label,
      'aria-label': label,
      'aria-pressed': listening,
      className: joinClasses(
        MIC_BASE,
        box,
        listening
          ? 'bg-red-500 text-white hover:bg-red-600'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      ),
    },
    // Pulsing "recording" ring — clear, animated state (decorative).
    listening
      ? createElement('span', {
          key: 'pulse',
          'aria-hidden': true,
          className:
            'pointer-events-none absolute inset-0 rounded-md bg-red-500/40 animate-ping',
        })
      : null,
    createElement(Mic, { key: 'icon', className: joinClasses(iconSize, 'relative') }),
  )
}
