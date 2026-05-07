import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
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
import { useAuthStore } from '../store/auth'

export const Route = createFileRoute('/app/$workspaceId/clips')({
  component: ClipsPage,
})

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

function ClipsPage() {
  const { workspaceId } = Route.useParams()
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
  const filtered = clips.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase()),
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
      const stream =
        mode === 'screen'
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
        if (blob.size === 0) {
          setUploadError('Recording output was empty. Please try again and record for at least a second.')
          stream.getTracks().forEach((t) => t.stop())
          setIsRecording(false)
          setRecordingStartedAt(null)
          return
        }
        const elapsed = recordingStartedAt ? Math.floor((Date.now() - recordingStartedAt) / 1000) : 0
        void uploadClip(blob, {
          durationSeconds: elapsed,
          title:
            mode === 'screen'
              ? `${workspaceName} screen recording ${Date.now().toString(36)}`
              : `${workspaceName} voice memo ${Date.now().toString(36)}`,
        }).catch((err) => {
          setUploadError((err as Error)?.message ?? 'Clip upload failed')
        })
        stream.getTracks().forEach((t) => t.stop())
        setIsRecording(false)
        setRecordingStartedAt(null)
      }
      setRecordingMode(mode)
      recorder.start()
      setRecordingStartedAt(Date.now())
      setRecordingNow(Date.now())
      setIsRecording(true)
    } catch (error) {
      console.error('Recording failed to start', error)
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
    })
    if (!putRes.ok) {
      const details = putRes.responseText
      setUploading(false)
      setUploadingFileName('')
      throw new Error(`R2 upload failed (${putRes.status}): ${details || putRes.statusText}`)
    }
    await qc.invalidateQueries({ queryKey: ['clips', workspaceId] })
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
            Workspace clips
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <Video className="h-4 w-4" />
            </span>
            Clips
            <Badge variant="secondary" className="ml-1">Live</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Record screen, voice or both. Every clip auto-transcribes and you can attach it to any task.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="lg" onClick={() => startRecording('voice')} disabled={isRecording || uploading}>
            <Mic className="h-4 w-4" /> Voice only
          </Button>
          <Button variant="gradient" size="lg" onClick={() => startRecording('screen')} disabled={isRecording || uploading}>
            <Monitor className="h-4 w-4" /> Record screen
          </Button>
          {isRecording && (
            <Button variant="destructive" size="lg" onClick={stopRecording}>
              <Square className="h-4 w-4" /> Stop ({recordingMode} · {recordingLabel})
            </Button>
          )}
        </div>
      </header>

      <Input
        leadingIcon={<Search className="h-4 w-4" />}
        placeholder="Search clips by title or transcript…"
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
            <span className="truncate">Uploading {uploadingFileName || 'clip'}...</span>
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

      {clipsQuery.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading clips...</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Video className="h-6 w-6" />}
          title="No clips yet"
          description="Hit Record screen to capture your first walkthrough."
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
            <DialogTitle>Share clip</DialogTitle>
            <DialogDescription>
              Share with a workspace member or anyone outside Rundesk.
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
                  {mode}
                </button>
              ))}
            </div>
            {shareMode === 'member' ? (
              <select
                className="w-full rounded border border-border bg-background h-9 px-2"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
              >
                <option value="">Select workspace member</option>
                {(membersQuery.data ?? []).map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName} ({m.email})
                  </option>
                ))}
              </select>
            ) : null}
            {shareMode === 'external' ? (
              <Input
                placeholder="friend@company.com"
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
              Generate share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete clip?</DialogTitle>
            <DialogDescription>
              {deleteClip
                ? `This will permanently remove "${deleteClip.title}". This action cannot be undone.`
                : 'This will permanently remove this clip. This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
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
              {removeClip.isPending ? 'Deleting...' : 'Delete clip'}
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
          <Sparkles className="h-3 w-3" /> Uploaded
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
              {clip.createdAt ? new Date(clip.createdAt).toLocaleDateString() : 'now'}
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
    xhr.onerror = () => reject(new Error('Network error while uploading clip'))
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
