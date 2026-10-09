/**
 * PICTURES OF A DESCRIPTION, FOR A COMMENT OR A MESSAGE (`ledger-rows/row-870`).
 *
 * ClickUp's AI makes images from a task's comment box or a Chat message field:
 * the AI button, a description, and the pictures, up to ten for one ask (its
 * help centre, "Generate images with Brain AI", through search excerpts). Here:
 * a description, how many (one to four), Generate — `POST /ai/images`, which
 * asks the image service the server is set up with — and the pictures, each
 * chosen or not; the chosen ones join the comment or the message as files, the
 * way any file does, and are uploaded with it.
 *
 * What it says when it cannot is the server's: image generation not set up
 * here, the service's rate limit, a description it would not draw, or a
 * service that did not answer.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Textarea, cn } from '@rundesk/ui'
import { Check, ImagePlus, Loader2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'

export type GeneratedImage = { fileName: string; mime: string; dataUrl: string }

/** A picture the server answered, as a file to attach. */
export function imageFile(image: GeneratedImage): File {
  const b64 = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], image.fileName, { type: image.mime })
}

export const IMAGE_COUNTS = [1, 2, 3, 4] as const

export function ImageGenerator({
  workspaceId,
  onAdd,
  addLabel,
}: {
  workspaceId: string | undefined
  onAdd: (files: File[]) => void
  addLabel: string
}) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState<number>(1)
  const [made, setMade] = useState<GeneratedImage[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const generate = useMutation({
    mutationFn: () =>
      api<{ images: GeneratedImage[] }>('/ai/images', { method: 'POST', body: { workspaceId, prompt: prompt.trim(), count } }),
    onMutate: () => {
      setError(null)
      setMade(null)
    },
    onSuccess: (r) => {
      setMade(r.images)
      setPicked(new Set(r.images.map((_, i) => i)))
    },
    // The server's own words: not set up, a rate limit and a refused description are different things to do about.
    onError: (err) => setError(err instanceof ApiError ? err.message : t('imageGen.failed')),
  })
  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div className="space-y-1.5" data-testid="image-generator">
      <Textarea
        rows={2}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={1000}
        placeholder={t('imageGen.placeholder')}
        aria-label={t('imageGen.placeholder')}
        data-testid="image-generator-prompt"
        className="text-xs"
      />
      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {t('imageGen.count')}
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            data-testid="image-generator-count"
            className="h-7 rounded border border-border bg-card px-1.5 text-[11px] text-foreground"
          >
            {IMAGE_COUNTS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          data-testid="image-generator-run"
          disabled={!prompt.trim() || generate.isPending || !workspaceId}
          onClick={() => generate.mutate()}
        >
          {generate.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ImagePlus className="mr-1 h-3 w-3" />}
          {t('imageGen.generate')}
        </Button>
      </div>
      {generate.isPending && (
        <div className="grid grid-cols-2 gap-1.5" aria-busy="true" data-testid="image-generator-pending">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded border border-border bg-muted/40" />
          ))}
        </div>
      )}
      {error && (
        <p className="text-[11px] text-rose-500" data-testid="image-generator-error">
          {error}
        </p>
      )}
      {made && (
        <>
          <p className="text-[11px] text-muted-foreground">{t('imageGen.pick')}</p>
          <div className="grid grid-cols-2 gap-1.5" data-testid="image-generator-results">
            {made.map((image, i) => (
              <button
                key={image.fileName}
                type="button"
                data-testid="image-generator-image"
                data-picked={picked.has(i) ? 'true' : 'false'}
                aria-pressed={picked.has(i)}
                onClick={() => toggle(i)}
                className={cn(
                  'relative aspect-square overflow-hidden rounded border-2 transition-colors',
                  picked.has(i) ? 'border-accent' : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <img src={image.dataUrl} alt={t('imageGen.alt', { n: i + 1, prompt: prompt.trim() })} className="h-full w-full object-cover" />
                {picked.has(i) && (
                  <span className="absolute right-1 top-1 rounded-full bg-accent p-0.5 text-white">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                )}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            data-testid="image-generator-add"
            disabled={picked.size === 0}
            onClick={() => {
              onAdd(made.filter((_, i) => picked.has(i)).map(imageFile))
              setMade(null)
              setPrompt('')
            }}
          >
            {addLabel}
          </Button>
        </>
      )}
    </div>
  )
}
