import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Input,
  cn,
} from '@rundesk/ui'
import { Upload, Image as ImageIcon, Link2, Paperclip, Loader2 } from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import { api } from '../lib/api'

/**
 * §V2-09 — the cover picker, from frame `03:10`.
 *
 * ClickUp's tabs are Gallery | Upload | Link | Search | Attachments, with a
 * Remove on the right. Four of those five are here and all four work.
 *
 * SEARCH IS DELIBERATELY ABSENT. It searches a stock photo library, and Rundesk
 * has no image provider configured. What stood here before was a "Photos" tab
 * with a search box that did nothing and six entries labelled "Mountains",
 * "Ocean", "City" that were CSS gradients — so a person searching for a
 * mountain got a blue-to-orange gradient and no way to tell why. An "AI" tab
 * did the same: a prompt box, a Generate button wired to nothing, and three
 * gradients underneath. Upload was a dashed rectangle with no file input at
 * all.
 *
 * Three of four tabs were decoration. A tab that cannot do the thing it is
 * named after is worse than a missing tab, because the missing one is honest.
 * They are gone; if a photo provider is ever configured, Search comes back as a
 * tab that searches.
 */

/** The Gallery tab: CSS colours, which is the half that always worked. */
const GRADIENTS = [
  'linear-gradient(135deg, hsl(268 88% 60%), hsl(330 88% 65%))',
  'linear-gradient(135deg, hsl(217 60% 60%), hsl(190 80% 55%))',
  'linear-gradient(135deg, hsl(35 95% 60%), hsl(15 85% 60%))',
  'linear-gradient(135deg, hsl(160 70% 50%), hsl(190 80% 55%))',
  'linear-gradient(135deg, hsl(330 88% 60%), hsl(15 85% 60%))',
  'linear-gradient(135deg, hsl(217 60% 55%), hsl(268 88% 60%))',
  'linear-gradient(135deg, hsl(190 80% 50%), hsl(160 70% 50%))',
  'linear-gradient(135deg, hsl(0 70% 55%), hsl(35 95% 60%))',
  'linear-gradient(135deg, hsl(280 70% 55%), hsl(217 60% 55%))',
  'linear-gradient(135deg, hsl(45 90% 60%), hsl(0 70% 55%))',
  'linear-gradient(135deg, hsl(120 50% 50%), hsl(190 80% 55%))',
  'linear-gradient(135deg, hsl(220 30% 30%), hsl(0 0% 10%))',
]

/**
 * What the picker hands back.
 *
 * A shape rather than one string, because a colour and an image are stored in
 * different columns and rendered differently. The caller used to receive `''`
 * for "remove", which is indistinguishable from a colour somebody cleared.
 */
export type CoverChoice =
  | { kind: 'color'; value: string }
  | { kind: 'stored'; storageKey: string }
  | { kind: 'link'; url: string }
  | { kind: 'none' }

type Attachment = { id: string; fileName: string; contentType: string; storageKey: string; url?: string | null }

export function CoverImagePicker({
  open,
  onOpenChange,
  taskId,
  onPick,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Needed for Upload (where to presign) and Attachments (what to list). */
  taskId: string
  onPick?: (choice: CoverChoice) => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'gallery' | 'upload' | 'link' | 'attachments'>('gallery')
  const [linkValue, setLinkValue] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function commit(choice: CoverChoice) {
    onPick?.(choice)
    onOpenChange(false)
  }

  /*
   * The task's own files, so a cover can be one that is already here — the
   * Attachments tab. Images only: offering a PDF as a cover is offering a
   * broken banner.
   */
  useEffect(() => {
    if (!open || tab !== 'attachments' || attachments !== null) return
    let cancelled = false
    void api<Attachment[]>(`/tasks/${taskId}/attachments`)
      .then((rows) => {
        if (!cancelled) setAttachments(rows.filter((r) => (r.contentType ?? '').startsWith('image/')))
      })
      .catch(() => {
        if (!cancelled) setAttachments([])
      })
    return () => { cancelled = true }
  }, [open, tab, taskId, attachments])

  // A fresh dialog should not show the last visit's typing or errors.
  useEffect(() => {
    if (open) return
    setLinkValue('')
    setLinkError(null)
    setUploadError(null)
    setAttachments(null)
    setTab('gallery')
  }, [open])

  async function upload(file: File) {
    setBusy(true)
    setUploadError(null)
    try {
      // The same presign the attachments tab uses, so a cover lands in the
      // task's own storage prefix and inherits its access rules.
      const { uploadUrl, storageKey } = await api<{ uploadUrl: string; storageKey: string }>(
        `/tasks/${taskId}/attachments/presign`,
        { method: 'POST', body: { fileName: file.name, contentType: file.type, sizeBytes: file.size } },
      )
      const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
      if (!put.ok) throw new Error(`upload failed: ${put.status}`)
      commit({ kind: 'stored', storageKey })
    } catch (err) {
      // Said out loud. The version of this tab that shipped before had no
      // handler at all, so a failed upload and a successful one looked the same:
      // nothing happened either way.
      setUploadError(err instanceof Error ? err.message : t('coverImage.uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  function submitLink() {
    const value = linkValue.trim()
    if (!/^https?:\/\//i.test(value)) {
      setLinkError(t('coverImage.linkMustBeHttp'))
      return
    }
    commit({ kind: 'link', url: value })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-accent" />
            {t('coverImage.title')}
          </DialogTitle>
          <DialogDescription>{t('coverImage.description')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="gallery" data-testid="cover-tab-gallery">{t('coverImage.tab.gallery')}</TabsTrigger>
              <TabsTrigger value="upload" data-testid="cover-tab-upload">{t('coverImage.tab.upload')}</TabsTrigger>
              <TabsTrigger value="link" data-testid="cover-tab-link">{t('coverImage.tab.link')}</TabsTrigger>
              <TabsTrigger value="attachments" data-testid="cover-tab-attachments">
                {t('coverImage.tab.attachments')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gallery">
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {GRADIENTS.map((g) => (
                  <button
                    key={g}
                    data-testid="cover-gallery-swatch"
                    onClick={() => commit({ kind: 'color', value: g })}
                    className="aspect-[5/3] rounded-lg border-2 border-transparent hover:border-border transition-all relative overflow-hidden"
                    style={{ background: g }}
                  >
                    <div className="absolute inset-0 bg-grid-dim opacity-30" />
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="upload">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="cover-upload-input"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void upload(file)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                data-testid="cover-upload-button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-lg border-2 border-dashed border-border/60 bg-card/40 hover:bg-card/60 transition-colors py-12 flex flex-col items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
                <div className="text-sm font-medium">{t('coverImage.uploadPrompt')}</div>
                <div className="text-xs text-muted-foreground">{t('coverImage.uploadHint')}</div>
              </button>
              {uploadError && (
                <p className="mt-2 text-xs text-red-600" data-testid="cover-upload-error">{uploadError}</p>
              )}
            </TabsContent>

            <TabsContent value="link">
              <div className="space-y-2">
                <Input
                  leadingIcon={<Link2 className="h-4 w-4" />}
                  placeholder={t('coverImage.linkPlaceholder')}
                  value={linkValue}
                  data-testid="cover-link-input"
                  onChange={(e) => { setLinkValue(e.target.value); setLinkError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitLink() }}
                />
                {linkError && <p className="text-xs text-red-600" data-testid="cover-link-error">{linkError}</p>}
                <Button size="sm" variant="gradient" data-testid="cover-link-apply" onClick={submitLink}>
                  {t('coverImage.useLink')}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="attachments">
              {attachments === null ? (
                <div className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
              ) : attachments.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground" data-testid="cover-attachments-empty">
                  {t('coverImage.noImageAttachments')}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[320px] overflow-auto">
                  {attachments.map((a) => (
                    <button
                      key={a.id}
                      data-testid="cover-attachment-option"
                      onClick={() => commit({ kind: 'stored', storageKey: a.storageKey })}
                      className="aspect-[5/3] rounded-lg border-2 border-transparent hover:border-accent transition-all relative overflow-hidden bg-card/40"
                    >
                      {a.url && <img src={a.url} alt={a.fileName} className="h-full w-full object-cover" />}
                      <span className="absolute bottom-1 left-2 text-[10px] text-white/90 drop-shadow">{a.fileName}</span>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="border-t border-border/40 bg-card/30 px-6 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" data-testid="cover-remove" onClick={() => commit({ kind: 'none' })}>
            <Paperclip className="h-3.5 w-3.5 opacity-0" aria-hidden />
            {t('coverImage.removeCover')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
