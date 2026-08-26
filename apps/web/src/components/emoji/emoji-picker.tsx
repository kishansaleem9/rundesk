import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import {
  Cat,
  Clock,
  Coffee,
  Flag,
  Hash,
  ImagePlus,
  Lightbulb,
  Plane,
  Plus,
  Search,
  Smile,
  Volleyball,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@rundesk/ui'
import { useTranslation } from '../../lib/i18n'
import {
  EMOJI_CATEGORIES,
  FREQUENT_SHOWN,
  SKIN_TONES,
  applySkinTone,
  bumpFrequent,
  loadEmojiCatalog,
  rankFrequent,
  readFrequent,
  readSkinTone,
  searchCustomEmoji,
  searchEmoji,
  writeFrequent,
  writeSkinTone,
  type CategoryId,
  type EmojiCatalog,
  type EmojiEntry,
  type FrequentCounts,
  type SkinTone,
} from '../../lib/emoji-picker'
import { reloadForStaleChunks } from '../../lib/chunk-reload'

/**
 * §2.8 gap 7 — the emoji picker, `[20:22-20:28]`.
 *
 *   "poori ki poori emoji icons ki list" — the whole list, searchable and
 *   categorised, with Frequently Used at the top and a `+` to add your own.
 *
 * One picker for every surface that offers emoji: the composer, a message
 * reaction, and a reaction thrown into a live call. They differ only in what
 * they do with the character that comes back, which is why they all take the
 * same component rather than each keeping a strip of twelve.
 */

export interface PickerCustomEmoji {
  id: string
  shortcode: string
  imageUrl: string
}

const CATEGORY_ICON: Record<CategoryId, LucideIcon> = {
  frequent: Clock,
  people: Smile,
  nature: Cat,
  food: Coffee,
  activity: Volleyball,
  travel: Plane,
  objects: Lightbulb,
  symbols: Hash,
  flags: Flag,
  custom: ImagePlus,
}

const TONE_LABEL = [
  'emoji.tone.default',
  'emoji.tone.light',
  'emoji.tone.mediumLight',
  'emoji.tone.medium',
  'emoji.tone.mediumDark',
  'emoji.tone.dark',
] as const

export function EmojiPicker({
  onSelect,
  onSelectCustom,
  customEmoji = [],
  onAddCustom,
  autoFocus = true,
  className,
}: {
  /** A native emoji, with the chosen skin tone already applied. */
  onSelect: (emoji: string) => void
  /** A workspace emoji, by shortcode. Omit to hide the Custom tab entirely. */
  onSelectCustom?: (shortcode: string) => void
  customEmoji?: PickerCustomEmoji[]
  /** Renders the `+`. Omit where the caller cannot add one (e.g. inside a call). */
  onAddCustom?: () => void
  autoFocus?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<{ catalog: EmojiCatalog; all: EmojiEntry[] } | null>(null)
  const [query, setQuery] = useState('')
  const [tone, setTone] = useState<SkinTone>(() => readSkinTone())
  const [toneOpen, setToneOpen] = useState(false)
  const [counts, setCounts] = useState<FrequentCounts>(() => readFrequent())
  const [activeCat, setActiveCat] = useState<CategoryId>('frequent')
  /** A tab press waiting for its section to exist again. */
  const [pendingJump, setPendingJump] = useState<CategoryId | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Read by the search memo, which runs before `showCustom` is computed below.
  const showCustomRef = useRef(false)
  const sectionRefs = useRef(new Map<CategoryId, HTMLDivElement>())

  // The list is its own chunk — nobody pays for 1,900 emoji until they open
  // this. Held after the first load, so opening it again is instant.
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setLoadFailed(false)
    loadEmojiCatalog().then(
      (loaded) => {
        if (live) setCatalog(loaded)
      },
      () => {
        // Said out loud, with a way to try again. A skeleton that never
        // resolves is indistinguishable from a picker that is simply slow.
        if (live) setLoadFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [attempt])

  const byChar = useMemo(() => {
    const map = new Map<string, EmojiEntry>()
    for (const e of catalog?.all ?? []) map.set(e.char, e)
    return map
  }, [catalog])

  const frequent = useMemo<EmojiEntry[]>(
    () =>
      rankFrequent(counts, FREQUENT_SHOWN).map(
        (char) => byChar.get(char) ?? { char, name: char, tone: false },
      ),
    [counts, byChar],
  )

  const results = useMemo(
    () => (query.trim() && catalog ? searchEmoji(catalog.all, query) : []),
    [query, catalog],
  )
  // Workspace emoji are searchable too. They live outside the Unicode catalog,
  // so a search that only looked there reported "No emoji matches that" for an
  // emoji sitting two sections down.
  const customResults = useMemo(
    () => (query.trim() && showCustomRef.current ? searchCustomEmoji(customEmoji, query) : []),
    [query, customEmoji],
  )

  // The running count lives in a ref as well as in state: two emoji clicked in
  // quick succession would otherwise both read the same pre-click state, and
  // the second would erase the first.
  const countsRef = useRef(counts)
  const pick = useCallback(
    (char: string, canTone: boolean) => {
      const next = bumpFrequent(countsRef.current, char)
      countsRef.current = next
      setCounts(next)
      writeFrequent(next)
      onSelect(applySkinTone(char, tone, canTone))
    },
    [tone, onSelect],
  )

  /**
   * One handler for the whole picker rather than one per emoji.
   *
   * With nearly two thousand buttons on screen, a closure per button is two
   * thousand closures rebuilt every time the skin tone changes. The character
   * is on the element; the click can be read off it.
   */
  const handleGridClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const el = (event.target as HTMLElement).closest<HTMLElement>('[data-emoji]')
      if (!el) return
      const char = el.dataset.emoji ?? ''
      const shortcode = el.dataset.shortcode
      if (shortcode) {
        // Custom emoji deliberately do not count towards Frequently Used: that
        // row renders characters, and a workspace emoji is an image that would
        // land in it as the literal text ":shipit:".
        onSelectCustom?.(shortcode)
        return
      }
      if (char) pick(char, el.dataset.tone === '1')
    },
    [pick, onSelectCustom],
  )

  const chooseTone = (next: SkinTone) => {
    setTone(next)
    writeSkinTone(next)
    setToneOpen(false)
  }

  /**
   * Jump to a category.
   *
   * Asked for here, performed in the effect below — because while a search is
   * running the category sections are not rendered at all, so their refs have
   * been deleted. Looking the section up first meant every tab in the strip
   * was dead the moment anybody typed: it returned before it even cleared the
   * query, so nothing moved and nothing said why.
   */
  const jumpTo = (id: CategoryId) => {
    setQuery('')
    setPendingJump(id)
  }

  // The scroll itself, once the sections it needs are back on screen.
  // Scrolling the container directly rather than scrollIntoView, which would
  // also scroll the page behind the popover.
  useEffect(() => {
    if (!pendingJump || query.trim()) return
    const container = scrollRef.current
    const target = sectionRefs.current.get(pendingJump)
    if (!container || !target) return
    container.scrollTop = target.offsetTop
    setActiveCat(pendingJump)
    setPendingJump(null)
  }, [pendingJump, query, catalog])

  // Which tab is lit follows the scroll, so it never claims you are somewhere
  // you scrolled away from.
  const handleScroll = () => {
    const container = scrollRef.current
    if (!container) return
    /*
     * At the bottom, the LAST section wins.
     *
     * A container cannot scroll past its own end, so the final section's
     * offsetTop is unreachable: jumping to Custom lit it for a frame and then
     * handleScroll re-elected Flags, leaving the strip claiming you were
     * somewhere you were not.
     */
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2
    const ids = [...sectionRefs.current.keys()]
    if (atBottom && ids.length > 0) {
      setActiveCat(ids[ids.length - 1])
      return
    }
    let current: CategoryId = 'frequent'
    for (const [id, el] of sectionRefs.current) {
      if (el.offsetTop <= container.scrollTop + 8) current = id
    }
    setActiveCat(current)
  }

  const setSectionRef = (id: CategoryId) => (el: HTMLDivElement | null) => {
    if (el) sectionRefs.current.set(id, el)
    else sectionRefs.current.delete(id)
  }

  const showCustom = !!onSelectCustom
  showCustomRef.current = showCustom
  const tabs = EMOJI_CATEGORIES.filter((c) => c.id !== 'custom' || showCustom)

  return (
    <div className={cn('w-[332px] select-none', className)} data-testid="emoji-picker">
      <div className="flex items-center gap-1.5 border-b border-border/60 p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('emoji.search')}
            aria-label={t('emoji.search')}
            data-testid="emoji-search"
            className="h-8 w-full rounded-md border border-border/70 bg-background pl-7 pr-2 text-[13px] outline-none focus:border-violet-500/50"
          />
        </div>

        {/* Skin tone. Stored per person, applied to everything that accepts one. */}
        <div className="relative">
          <button
            type="button"
            title={t('emoji.skinTone')}
            aria-label={t('emoji.skinTone')}
            data-testid="emoji-tone"
            onClick={() => setToneOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-base hover:bg-muted"
          >
            {applySkinTone('✋', tone)}
          </button>
          {toneOpen && (
            <div
              className="absolute right-0 top-9 z-20 flex gap-0.5 rounded-md border border-border bg-popover p-1 shadow-lg"
              data-testid="emoji-tone-list"
            >
              {SKIN_TONES.map((swatch, i) => (
                <button
                  key={swatch || 'default'}
                  type="button"
                  title={t(TONE_LABEL[i])}
                  aria-label={t(TONE_LABEL[i])}
                  aria-pressed={tone === swatch}
                  onClick={() => chooseTone(swatch)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded text-base hover:bg-muted',
                    tone === swatch && 'ring-2 ring-violet-500',
                  )}
                >
                  {applySkinTone('✋', swatch)}
                </button>
              ))}
            </div>
          )}
        </div>

        {onAddCustom && (
          <button
            type="button"
            title={t('emoji.addCustom')}
            aria-label={t('emoji.addCustom')}
            data-testid="emoji-add-custom"
            onClick={onAddCustom}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={handleGridClick}
        className="relative h-[264px] overflow-y-auto overscroll-contain p-2"
        data-testid="emoji-scroll"
      >
        {/*
          §2.9a — the shape of the thing, not the word "Loading".
          A grid of grey squares says "emoji are coming" in the size and layout
          they will actually arrive in; a line of text says "something is
          happening somewhere" and then makes the panel jump when it resolves.
        */}
        {loadFailed && (
          <div className="px-1 py-6 text-center" data-testid="emoji-load-failed">
            <p className="text-[13px] text-muted-foreground">{t('emoji.loadFailed')}</p>
            <button
              type="button"
              /*
               * Try again RELOADS, because trying again in place cannot work.
               *
               * A dynamic import that fails is recorded as failed in the
               * browser's module map, and every later import of that same URL
               * returns the recorded failure without touching the network —
               * even once the network is healthy again. Verified in Chromium:
               * a second import of a URL whose first fetch was aborted makes
               * no request at all. So a button that only re-ran the import was
               * a button that could never succeed.
               *
               * A fresh document has a fresh module map, and it re-reads
               * index.html, so it also picks up a chunk whose hash moved in a
               * deploy — which is the common way this happens. Forced past the
               * automatic-recovery cooldown: that guard is there to stop a
               * loop, and a person pressing a button is not one.
               */
              onClick={() => {
                if (!reloadForStaleChunks(true)) setAttempt((n) => n + 1)
              }}
              data-testid="emoji-retry"
              className="mt-2 rounded-md border border-border/70 px-2.5 py-1 text-[12px] hover:bg-muted"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {!catalog && !loadFailed && (
          <div
            className="grid grid-cols-8 gap-0.5"
            data-testid="emoji-loading"
            aria-busy="true"
            aria-live="polite"
          >
            {/* Literal, like every other skeleton in the app: a screen reader
                still needs the word, and routing it through a locale key is
                what would make the "no visible Loading copy" guard fire. */}
            <span className="sr-only">Loading…</span>
            {Array.from({ length: 40 }, (_, i) => (
              <span key={i} className="h-9 w-9 animate-pulse rounded bg-muted/60" />
            ))}
          </div>
        )}

        {catalog && query.trim() && (
          <Section id="search" label={t('emoji.results')}>
            {results.length === 0 && customResults.length === 0 ? (
              <p className="px-1 py-2 text-[12px] text-muted-foreground" data-testid="emoji-no-results">
                {t('emoji.noResults')}
              </p>
            ) : (
              <>
                {customResults.length > 0 && (
                  <div className="grid grid-cols-8 gap-0.5" data-testid="emoji-search-custom">
                    {customResults.map((ce) => (
                      <button
                        key={ce.id}
                        type="button"
                        data-emoji={`:${ce.shortcode}:`}
                        data-shortcode={ce.shortcode}
                        title={`:${ce.shortcode}:`}
                        className="flex h-9 w-9 items-center justify-center rounded hover:bg-muted"
                      >
                        <img src={ce.imageUrl} alt={ce.shortcode} loading="lazy" className="h-5 w-5 object-contain" />
                      </button>
                    ))}
                  </div>
                )}
                <Grid entries={results} tone={tone} />
              </>
            )}
          </Section>
        )}

        {catalog && !query.trim() && (
          <>
            <Section id="frequent" label={t('emoji.frequent')} innerRef={setSectionRef('frequent')}>
              <Grid entries={frequent} tone={tone} />
            </Section>

            {EMOJI_CATEGORIES.map(({ id, labelKey }) => {
              if (id === 'frequent' || id === 'custom') return null
              return (
                <Section key={id} id={id} label={t(labelKey)} innerRef={setSectionRef(id)}>
                  <Grid entries={catalog.catalog[id]} tone={tone} />
                </Section>
              )
            })}

            {showCustom && (
              <Section id="custom" label={t('emoji.custom')} innerRef={setSectionRef('custom')}>
                {customEmoji.length === 0 ? (
                  <p className="px-1 py-2 text-[12px] text-muted-foreground">{t('emoji.customEmpty')}</p>
                ) : (
                  <div className="grid grid-cols-8 gap-0.5">
                    {customEmoji.map((ce) => (
                      <button
                        key={ce.id}
                        type="button"
                        data-emoji={`:${ce.shortcode}:`}
                        data-shortcode={ce.shortcode}
                        title={`:${ce.shortcode}:`}
                        className="flex h-9 w-9 items-center justify-center rounded hover:bg-muted"
                      >
                        <img src={ce.imageUrl} alt={ce.shortcode} loading="lazy" className="h-5 w-5 object-contain" />
                      </button>
                    ))}
                  </div>
                )}
              </Section>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-0.5 border-t border-border/60 px-1.5 py-1" data-testid="emoji-tabs">
        {tabs.map(({ id, labelKey }) => {
          const Icon = CATEGORY_ICON[id]
          return (
            <button
              key={id}
              type="button"
              title={t(labelKey)}
              aria-label={t(labelKey)}
              aria-pressed={!query.trim() && activeCat === id}
              data-testid={`emoji-tab-${id}`}
              onClick={() => jumpTo(id)}
              className={cn(
                'flex h-7 flex-1 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground',
                !query.trim() && activeCat === id && 'bg-muted text-violet-600 dark:text-violet-300',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Section({
  id,
  label,
  innerRef,
  children,
}: {
  id: CategoryId | 'search'
  label: string
  innerRef?: (el: HTMLDivElement | null) => void
  children: ReactNode
}) {
  return (
    <div ref={innerRef} data-testid={`emoji-section-${id}`}>
      <div className="sticky top-0 z-10 -mx-2 bg-popover px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  )
}

/**
 * The grid itself carries no handlers — the scroll container reads the click
 * off `data-emoji`. `data-tone` says whether this one may be tinted, so the
 * click path never has to look the entry up again.
 */
function Grid({ entries, tone }: { entries: EmojiEntry[]; tone: SkinTone }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {entries.map((e) => (
        <button
          key={e.char}
          type="button"
          data-emoji={e.char}
          data-tone={e.tone ? '1' : '0'}
          title={e.name}
          className="h-9 w-9 rounded text-[20px] leading-none hover:bg-muted"
        >
          {applySkinTone(e.char, tone, e.tone)}
        </button>
      ))}
    </div>
  )
}
