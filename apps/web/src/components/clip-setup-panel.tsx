/**
 * The screen-record setup panel, frame `04:55`.
 *
 * Source `Entire screen` · quality `1080p` · mic `Default – Internal
 * Microphone` · a red **Record Clip** button. Before this, both of Rundesk's
 * recorders went straight to `getDisplayMedia({ video: true, audio: true })` on
 * the click: no say in what was captured, at what size, or through which
 * microphone.
 *
 * ONE PANEL, TWO CALLERS — the comment composer and the clips page. Its
 * choices, and the constraints they turn into, live in
 * `apps/web/src/lib/clip-capture.ts` so neither caller owns them; this file is
 * only the controls. That split is the point: a panel built into one recorder
 * would have left the other still recording at whatever the browser felt like.
 *
 * THE SOURCE ROW IS A PREFERENCE, AND SAYS SO. A web page cannot enumerate
 * screens or windows — `getDisplayMedia` always opens the browser's own picker.
 * `displaySurface` only asks the browser to pre-select a tab in that dialog, so
 * the row is followed by a line saying the browser will still ask. A dropdown
 * that listed your monitors would be a facade over an API that does not offer
 * them, and the person would find out at the moment they were recording.
 */
import { useEffect, useState } from 'react'
import { Video, Loader2 } from 'lucide-react'
import { Button } from '@rundesk/ui'
import { useTranslation } from '../lib/i18n'
import {
  CLIP_QUALITIES,
  CLIP_SURFACES,
  listMicrophones,
  readClipSetup,
  writeClipSetup,
  type ClipSetup,
  type ClipSurface,
  type MicOption,
} from '../lib/clip-capture'

const SURFACE_LABEL_KEYS = {
  monitor: 'clipSetup.sourceMonitor',
  window: 'clipSetup.sourceWindow',
  browser: 'clipSetup.sourceBrowser',
} as const

export function ClipSetupPanel({
  onRecord,
  onCancel,
  starting = false,
}: {
  /** Called with the chosen setup. The caller opens the stream. */
  onRecord: (setup: ClipSetup) => void
  onCancel: () => void
  starting?: boolean
}) {
  const { t } = useTranslation()
  /*
   * Seeded from what was used last time. Somebody who records at 720p through
   * a headset does it again, and re-picking both every time is the sort of
   * friction that stops people recording at all.
   */
  const [draft, setDraft] = useState<ClipSetup>(() => readClipSetup())
  const [mics, setMics] = useState<MicOption[]>([])

  useEffect(() => {
    let alive = true
    void listMicrophones().then((found) => {
      if (alive) setMics(found)
    })
    return () => {
      alive = false
    }
  }, [])

  const row = 'flex items-center justify-between gap-3'
  const label = 'text-[11px] font-medium text-muted-foreground'
  const select = 'h-7 rounded border border-border bg-background px-1.5 text-xs'

  return (
    <div
      className="w-full max-w-sm space-y-2 rounded-md border border-border bg-card p-3"
      data-testid="clip-setup-panel"
    >
      <h4 className="text-xs font-semibold">{t('clipSetup.title')}</h4>

      <div className={row}>
        <span className={label}>{t('clipSetup.source')}</span>
        <select
          className={select}
          data-testid="clip-setup-source"
          value={draft.surface}
          onChange={(e) => setDraft({ ...draft, surface: e.target.value as ClipSurface })}
        >
          {CLIP_SURFACES.map((s) => (
            <option key={s} value={s}>
              {t(SURFACE_LABEL_KEYS[s])}
            </option>
          ))}
        </select>
      </div>

      <div className={row}>
        <span className={label}>{t('clipSetup.quality')}</span>
        <select
          className={select}
          data-testid="clip-setup-quality"
          value={draft.quality}
          onChange={(e) => setDraft({ ...draft, quality: e.target.value as ClipSetup['quality'] })}
        >
          {CLIP_QUALITIES.map((q) => (
            <option key={q.id} value={q.id}>
              {q.label}
            </option>
          ))}
        </select>
      </div>

      <div className={row}>
        <span className={label}>{t('clipSetup.microphone')}</span>
        <select
          className={select}
          data-testid="clip-setup-mic"
          value={draft.micId}
          onChange={(e) => setDraft({ ...draft, micId: e.target.value })}
        >
          {/* A silent screen capture is a real choice, not a failure state. */}
          <option value="">{t('clipSetup.micNone')}</option>
          <option value="default">{t('clipSetup.micDefault')}</option>
          {mics
            // The system default already has its own row above; listing the
            // device the browser calls "default" again would offer the same
            // microphone twice under two names.
            .filter((m) => m.deviceId && m.deviceId !== 'default')
            .map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label}
              </option>
            ))}
        </select>
      </div>

      {/*
        The honest sentence. Everything above is a request; the browser's own
        dialog is where the screen is actually chosen, and hiding that would
        make the source row look like a control it is not.
      */}
      <p className="text-[10px] leading-snug text-muted-foreground" data-testid="clip-setup-browser-note">
        {t('clipSetup.browserAsks')}
      </p>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel} data-testid="clip-setup-cancel">
          {t('common.cancel')}
        </Button>
        {/* Red, as the frame has it: this starts capturing your screen. */}
        <Button
          size="sm"
          disabled={starting}
          data-testid="clip-setup-record"
          className="bg-red-600 text-white hover:bg-red-700"
          onClick={() => {
            writeClipSetup(draft)
            onRecord(draft)
          }}
        >
          {starting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Video className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t('clipSetup.record')}
        </Button>
      </div>
    </div>
  )
}
