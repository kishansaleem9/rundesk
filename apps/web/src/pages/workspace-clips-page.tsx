import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  PersonAvatar,
  cn,
  toast,
} from '@rundesk/ui'
import {
  Video,
  Mic,
  Monitor,
  Search,
  Play,
  Square,
  Clock,
  Sparkles,
  Trash2,
  Share2,
  Copy,
} from 'lucide-react'
import { api } from '../lib/api'
import { matchesClipKind } from '../lib/clip-kind'
import { useAuthStore } from '../store/auth'
import { useTranslation } from '../lib/i18n'
import { InlineSkeleton } from '../components/loading-skeletons'

type Clip = {
  id: string
  title: string
  durationSeconds: number
  recordedBy: string
  createdAt: string | null
  sizeBytes: number
  url: string
  storageKey: string
}

type WorkspaceMember = {
  userId: string
  displayName: string
  email: string
}

export function ClipsPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/clips' })
  // §G07-5 — which library this is. Undefined means both.
  const { kind: kindFilter } = useSearch({ from: '/app/$workspaceId/clips' })
  const navigate = useNavigate()
  const qc = useQueryClient()
  const workspaces = useAuthStore((s) => s.workspaces)
  const [query, setQuery] = useState('')
  const [recordingMode, setRecordingMode] = useState<'screen' | 'voice'>('screen')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null)
  const [recordingNow, setRecordingNow] = useState<number>(Date.now())
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadingFileName, setUploadingFileName] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareClip, setShareClip] = useState<Clip | null>(null)
  const [shareMode, setShareMode] = useState<'member' | 'external' | 'public'>('member')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [externalEmail, setExternalEmail] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteClip, setDeleteClip] = useState<Clip | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingStartedAtRef = useRef<number | null>(null)
  const clipsQuery = useQuery({
    queryKey: ['clips', workspaceId],
    queryFn: () => api<Clip[]>(`/workspaces/${workspaceId}/clips`),
  })
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
  })
  const removeClip = useMutation({
    mutationFn: (storageKey: string) =>
      api(`/workspaces/${workspaceId}/clips`, {
        method: 'DELETE',
        body: { storageKey },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['clips', workspaceId] })
    },
  })
  const shareMutation = useMutation({
    mutationFn: () => {
      if (!shareClip) throw new Error('Pick a clip first')
      return api<{ shareUrl: string; sentTo?: string }>(`/workspaces/${workspaceId}/clips/share`, {
        method: 'POST',
        body: {
          storageKey: shareClip.storageKey,
          mode: shareMode,
          userId: shareMode === 'member' ? selectedMemberId : undefined,
          email: shareMode === 'external' ? externalEmail.trim() : undefined,
          expiresInMinutes: 60,
        },
      })
    },
    onSuccess: (data) => {
      setShareUrl(data.shareUrl)
    },
  })
  const clips = clipsQuery.data ?? []
  const workspaceName =
    workspaces.find((w) => w.id === workspaceId)?.name?.trim() || 'workspace'
  // §G07-5 — audio recordings and screen clips are different libraries. The
  // rule lives in lib/clip-kind so it can be tested without a browser: clips
  // come from object storage, which is unconfigured in CI, so a list-driven
  // check here would pass against an empty page forever.
  const filtered = clips.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) &&
      matchesClipKind(c.storageKey, kindFilter),
  )
  const recordingLabel = useMemo(() => {
    if (!recordingStartedAt) return '00:00'
    const sec = Math.floor((recordingNow - recordingStartedAt) / 1000)
    const mm = Math.floor(sec / 60)
    const ss = sec % 60
    return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
  }, [recordingNow, recordingStartedAt])

  useEffect(() => {
    if (!isRecording) return
    const timer = window.setInterval(() => setRecordingNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isRecording])

  async function startRecording(mode: 'screen' | 'voice') {
    if (isRecording) return
    try {
      setUploadError(null)

      if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices?.getUserMedia) {
        const message = t('clips.recordingUnavailableBody')
        setUploadError(message)
        toast.error(t('clips.recordingUnavailable'), { description: message })
        return
      }

      let stream: MediaStream
      try {
        stream =
          mode === 'screen'
            ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
            : await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (captureError) {
        // getDisplayMedia/getUserMedia reject when permission is denied, the
        // picker is dismissed, the context is insecure, or display-capture is
        // disallowed (e.g. inside an iframe). Surface it clearly and make sure
        // no "starting" UI state is left hanging.
        const message =
          mode === 'screen'
            ? t('clips.screenBlockedBody')
            : t('clips.micBlockedBody')
        console.error('Recording failed to start', captureError)
        setUploadError(message)
        toast.error(
          mode === 'screen' ? t('clips.screenBlocked') : t('clips.micBlocked'),
          { description: message },
        )
        // Reset any transient capture/recording state so nothing looks stuck.
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        recordingStartedAtRef.current = null
        setIsRecording(false)
        setRecordingStartedAt(null)
        return
      }

      mediaStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      // Capture the start timestamp in a ref so `onstop` reads the real value
      // instead of the (initially null) state captured when the recorder was
      // created. Without this the first recording always computes duration 0.
      const startedAt = Date.now()
      recordingStartedAtRef.current = startedAt
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
        if (blob.size === 0) {
          setUploadError(t('clips.emptyRecording'))
          stream.getTracks().forEach((track) => track.stop())
          recordingStartedAtRef.current = null
          setIsRecording(false)
          setRecordingStartedAt(null)
          return
        }
        const startTs = recordingStartedAtRef.current ?? startedAt
        const elapsed = Math.max(0, Math.floor((Date.now() - startTs) / 1000))
        void uploadClip(blob, {
          durationSeconds: elapsed,
          title:
            mode === 'screen'
              ? `${workspaceName} screen recording ${Date.now().toString(36)}`
              : `${workspaceName} voice memo ${Date.now().toString(36)}`,
        }).catch((err) => {
          const message = (err as Error)?.message ?? t('clips.uploadFailed')
          setUploadError(message)
          toast.error(t('clips.uploadFailed'), { description: message })
        })
        stream.getTracks().forEach((track) => track.stop())
        recordingStartedAtRef.current = null
        setIsRecording(false)
        setRecordingStartedAt(null)
      }
      setRecordingMode(mode)
      recorder.start()
      setRecordingStartedAt(startedAt)
      setRecordingNow(Date.now())
      setIsRecording(true)
    } catch (error) {
      // Catch-all so a click on "Record screen" can never throw out of the
      // handler and leave the page looking blank/frozen.
      console.error('Recording failed to start', error)
      const message =
        (error as Error)?.message ?? t('clips.startFailedBody')
      setUploadError(message)
      toast.error(t('clips.couldNotStart'), { description: message })
      mediaStreamRef.current = null
      mediaRecorderRef.current = null
      recordingStartedAtRef.current = null
      setIsRecording(false)
      setRecordingStartedAt(null)
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Flush final buffered chunk before stopping to avoid 0-byte uploads.
      try {
        mediaRecorderRef.current.requestData()
      } catch {
        // ignore
      }
      mediaRecorderRef.current.stop()
    }
  }

  async function uploadClip(blob: Blob, data: { durationSeconds: number; title: string }) {
    setUploadError(null)
    const extension = 'webm'
    const workspaceSlug = workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'workspace'
    const kind = data.title.toLowerCase().includes('voice') ? 'voice-memo' : 'screen-recording'
    const uniqueId = Date.now().toString(36)
    const fileName = `${workspaceSlug}-${kind}-${uniqueId}.${extension}`
    setUploading(true)
    setUploadProgress(0)
    setUploadingFileName(fileName)
    let succeeded = false
    try {
      const presign = await api<{ uploadUrl: string; storageKey: string }>(
        `/workspaces/${workspaceId}/clips/presign`,
        {
          method: 'POST',
          body: {
            fileName,
            contentType: blob.type || 'video/webm',
            durationSeconds: data.durationSeconds,
            title: `${workspaceName} ${kind.replace('-', ' ')} ${uniqueId}`,
          },
        },
      )
      const putRes = await uploadBlobWithProgress({
        url: presign.uploadUrl,
        blob,
        contentType: blob.type || 'video/webm',
        onProgress: (percent) => setUploadProgress(percent),
        networkErrorMessage: t('clips.networkError'),
      })
      if (!putRes.ok) {
        const details = putRes.responseText
        throw new Error(
          t('clips.storageUploadFailed', {
            status: putRes.status,
            details: details || putRes.statusText,
          }),
        )
      }
      await qc.invalidateQueries({ queryKey: ['clips', workspaceId] })
      succeeded = true
    } finally {
      // On any failure (presign error, R2/CORS rejection, or network error)
      // clear the uploading UI immediately so it never hangs. The happy path
      // keeps the progress bar visible briefly via the timeout below.
      if (!succeeded) {
        setUploading(false)
        setUploadingFileName('')
        setUploadProgress(0)
      }
    }
    setUploadProgress(100)
    setTimeout(() => {
      setUploading(false)
      setUploadingFileName('')
    }, 250)
  }

  return (
    <div className="p-6 space-y-7 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            {t('clips.eyebrow')}
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <Video className="h-4 w-4" />
            </span>
            {t('nav.clips')}
            <Badge variant="secondary" className="ml-1">{t('clips.live')}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            {t('clips.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="lg" onClick={() => startRecording('voice')} disabled={isRecording || uploading}>
            <Mic className="h-4 w-4" /> {t('clips.voiceOnly')}
          </Button>
          <Button variant="gradient" size="lg" onClick={() => startRecording('screen')} disabled={isRecording || uploading}>
            <Monitor className="h-4 w-4" /> {t('clips.recordScreen')}
          </Button>
          {isRecording && (
            <Button variant="destructive" size="lg" onClick={stopRecording}>
              <Square className="h-4 w-4" /> {t('clips.stop')} ({recordingMode === 'screen' ? t('clips.modeScreen') : t('clips.modeVoice')} · {recordingLabel})
            </Button>
          )}
        </div>
      </header>

      <Input
        leadingIcon={<Search className="h-4 w-4" />}
        placeholder={t('clips.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />
      {uploadError ? (
        <Card className="p-3 border-rose-500/40 text-sm text-rose-500">
          {uploadError}
        </Card>
      ) : null}
      {uploading ? (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate">{t('clips.uploading', { name: uploadingFileName || t('clips.clipNoun') })}</span>
            <span className="text-muted-foreground">{uploadProgress}%</span>
          </div>
          <div className="h-2 w-full rounded bg-muted overflow-hidden">
            <div
              className="h-full bg-brand-gradient transition-[width] duration-200"
              style={{ width: `${Math.max(2, uploadProgress)}%` }}
            />
          </div>
        </Card>
      ) : null}

      {/*
        §G07-5 — say which library you are in, and offer the way out.

        Filtering silently is how a full library reads as an empty one: with
        no audio recorded yet, `?kind=audio` showed the same "no clips" panel
        as a workspace that had never recorded anything, and nothing on screen
        explained the difference.
      */}
      {kindFilter && (
        <div className="flex items-center gap-2 text-xs" data-testid="clips-kind-filter">
          <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
            {t(kindFilter === 'audio' ? 'clips.filterAudio' : 'clips.filterVideo')}
          </span>
          <button
            type="button"
            data-testid="clips-kind-clear"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => navigate({ to: '/app/$workspaceId/clips', params: { workspaceId }, search: {} })}
          >
            {t('clips.filterShowAll')}
          </button>
        </div>
      )}

      {clipsQuery.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground"><InlineSkeleton /></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Video className="h-6 w-6" />}
          title={t('clips.emptyTitle')}
          description={t('clips.emptyBody')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <ClipCard
              key={c.id}
              clip={c}
              onDelete={() => {
                setDeleteClip(c)
                setDeleteOpen(true)
              }}
              onShare={() => {
                setShareClip(c)
                setShareMode('member')
                setSelectedMemberId('')
                setExternalEmail('')
                setShareUrl('')
                setShareOpen(true)
              }}
            />
          ))}
        </div>
      )}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('clips.shareTitle')}</DialogTitle>
            <DialogDescription>
              {t('clips.shareDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              {(['member', 'external', 'public'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setShareMode(mode)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded border',
                    shareMode === mode ? 'bg-accent/15 border-accent/40 text-accent' : 'border-border text-muted-foreground',
                  )}
                >
                  {mode === 'member'
                    ? t('clips.shareModeMember')
                    : mode === 'external'
                      ? t('clips.shareModeExternal')
                      : t('clips.shareModePublic')}
                </button>
              ))}
            </div>
            {shareMode === 'member' ? (
              <select
                className="w-full rounded border border-border bg-background h-9 px-2"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
              >
                <option value="">{t('clips.selectMember')}</option>
                {(membersQuery.data ?? []).map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName} ({m.email})
                  </option>
                ))}
              </select>
            ) : null}
            {shareMode === 'external' ? (
              <Input
                placeholder={t('clips.externalEmailPlaceholder')}
                value={externalEmail}
                onChange={(e) => setExternalEmail(e.target.value)}
              />
            ) : null}
            {shareUrl ? (
              <div className="rounded border border-border p-2 text-xs flex items-center gap-2">
                <span className="truncate flex-1">{shareUrl}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(shareUrl)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => shareMutation.mutate()}
              disabled={
                shareMutation.isPending ||
                !shareClip ||
                (shareMode === 'member' && !selectedMemberId) ||
                (shareMode === 'external' && !externalEmail.trim())
              }
            >
              {t('clips.generateShare')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('clips.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {deleteClip
                ? t('clips.deleteBodyNamed', { title: deleteClip.title })
                : t('clips.deleteBodyGeneric')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleteClip) return
                removeClip.mutate(deleteClip.storageKey, {
                  onSuccess: () => {
                    setDeleteOpen(false)
                    setDeleteClip(null)
                  },
                })
              }}
              disabled={removeClip.isPending}
            >
              {removeClip.isPending ? t('clips.deleting') : t('clips.deleteClip')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ClipCard({
  clip,
  onDelete,
  onShare,
}: {
  clip: Clip
  onDelete: () => void
  onShare: () => void
}) {
  const { t } = useTranslation()
  const [resolvedDuration, setResolvedDuration] = useState<number>(clip.durationSeconds ?? 0)
  const duration = `${Math.floor((resolvedDuration ?? 0) / 60)}:${String((resolvedDuration ?? 0) % 60).padStart(2, '0')}`
  return (
    <Card variant="glass" className="cursor-pointer p-0 overflow-hidden transition-all hover:shadow-glow hover:border-accent/40 group">
      <div
        className="relative aspect-video overflow-hidden"
        style={{ background: 'linear-gradient(135deg, hsl(230 50% 45%), hsl(270 70% 55%))' }}
      >
        <video
          src={clip.url}
          controls
          className="absolute inset-0 h-full w-full object-cover"
          onLoadedMetadata={(e) => {
            const sec = Math.max(0, Math.round((e.currentTarget.duration || 0)))
            if (sec > 0) setResolvedDuration(sec)
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center transition-transform group-hover:scale-110')}>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/30">
            <Play className="h-6 w-6 fill-white text-white ml-0.5" />
          </div>
        </div>
        <Badge variant="soft" className="absolute top-2 right-2 text-[10px] backdrop-blur-sm bg-black/60 text-white border-transparent">
          {duration}
        </Badge>
        <Badge variant="gradient" className="absolute top-2 left-2 text-[10px]">
          <Sparkles className="h-3 w-3" /> {t('clips.uploaded')}
        </Badge>
      </div>
      <div className="p-4">
        <div className="font-medium truncate">{clip.title}</div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <PersonAvatar name={clip.recordedBy} size="sm" />
            <span className="truncate">{clip.recordedBy}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {clip.createdAt ? new Date(clip.createdAt).toLocaleDateString() : t('clips.now')}
            </span>
            <button className="text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button className="text-muted-foreground hover:text-foreground" onClick={onShare}>
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

async function uploadBlobWithProgress(args: {
  url: string
  blob: Blob
  contentType: string
  onProgress: (percent: number) => void
  networkErrorMessage?: string
}): Promise<{ ok: boolean; status: number; statusText: string; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', args.url, true)
    xhr.setRequestHeader('Content-Type', args.contentType)
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const percent = Math.round((event.loaded / event.total) * 100)
      args.onProgress(Math.min(100, Math.max(0, percent)))
    }
    xhr.onerror = () =>
      reject(new Error(args.networkErrorMessage ?? 'Network error while uploading clip'))
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        statusText: xhr.statusText,
        responseText: xhr.responseText,
      })
    }
    xhr.send(args.blob)
  })
}
