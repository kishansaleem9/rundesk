import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Card,
  Button,
  Badge,
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
  Clock,
  MessageSquare,
  Sparkles,
} from 'lucide-react'

export const Route = createFileRoute('/app/$workspaceId/clips')({
  component: ClipsPage,
})

type Clip = {
  id: string
  title: string
  duration: string
  recordedBy: string
  recordedAt: string
  views: number
  comments: number
  thumbnail: string
  transcript: boolean
}

const MOCK_CLIPS: Clip[] = [
  {
    id: 'walkthrough-1',
    title: 'Onboarding flow walkthrough',
    duration: '3:42',
    recordedBy: 'Hamda Tahir',
    recordedAt: '1 hour ago',
    views: 8,
    comments: 4,
    thumbnail: 'linear-gradient(135deg, hsl(268 88% 50%), hsl(330 88% 60%))',
    transcript: true,
  },
  {
    id: 'bug-repro',
    title: 'Repro: timeline header overlap',
    duration: '1:14',
    recordedBy: 'Afzaal Ali',
    recordedAt: 'Yesterday',
    views: 12,
    comments: 2,
    thumbnail: 'linear-gradient(135deg, hsl(0 70% 55%), hsl(35 95% 60%))',
    transcript: true,
  },
  {
    id: 'demo-rundesk',
    title: 'Rundesk overview demo (cut for May 1)',
    duration: '6:08',
    recordedBy: 'Afzaal Ali',
    recordedAt: '3 days ago',
    views: 24,
    comments: 11,
    thumbnail: 'linear-gradient(135deg, hsl(217 60% 55%), hsl(190 80% 55%))',
    transcript: true,
  },
  {
    id: 'design-review',
    title: 'Design review — settings layout',
    duration: '4:21',
    recordedBy: 'Iqra Khalid',
    recordedAt: '1 week ago',
    views: 5,
    comments: 1,
    thumbnail: 'linear-gradient(135deg, hsl(160 70% 50%), hsl(217 60% 60%))',
    transcript: false,
  },
]

function ClipsPage() {
  const [query, setQuery] = useState('')
  const filtered = MOCK_CLIPS.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase()),
  )

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
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Record screen, voice or both. Every clip auto-transcribes and you can attach it to any task.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="lg">
            <Mic className="h-4 w-4" /> Voice only
          </Button>
          <Button variant="gradient" size="lg">
            <Monitor className="h-4 w-4" /> Record screen
          </Button>
        </div>
      </header>

      <Input
        leadingIcon={<Search className="h-4 w-4" />}
        placeholder="Search clips by title or transcript…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Video className="h-6 w-6" />}
          title="No clips yet"
          description="Hit Record screen to capture your first walkthrough."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <ClipCard key={c.id} clip={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function ClipCard({ clip }: { clip: Clip }) {
  return (
    <Card variant="glass" className="cursor-pointer p-0 overflow-hidden transition-all hover:shadow-glow hover:border-accent/40 group">
      <div
        className="relative aspect-video overflow-hidden"
        style={{ background: clip.thumbnail }}
      >
        {/* Mock waveform / scrubber */}
        <svg viewBox="0 0 320 90" className="absolute inset-x-0 bottom-0 h-1/3 w-full opacity-50">
          {[...Array(40)].map((_, i) => {
            const h = 12 + Math.abs(Math.sin(i * 0.7) * 30 + Math.cos(i * 0.3) * 18)
            return <rect key={i} x={i * 8} y={45 - h / 2} width="3" height={h} fill="white" rx="1" />
          })}
        </svg>
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center transition-transform group-hover:scale-110">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/30">
            <Play className="h-6 w-6 fill-white text-white ml-0.5" />
          </div>
        </div>
        <Badge variant="soft" className="absolute top-2 right-2 text-[10px] backdrop-blur-sm bg-black/60 text-white border-transparent">
          {clip.duration}
        </Badge>
        {clip.transcript && (
          <Badge variant="gradient" className="absolute top-2 left-2 text-[10px]">
            <Sparkles className="h-3 w-3" /> Transcribed
          </Badge>
        )}
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
              <Play className="h-3 w-3" />
              {clip.views}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {clip.comments}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {clip.recordedAt}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}
