import { Card, Badge } from '@rundesk/ui'
import { ExternalLink, Play, Figma as FigmaIcon, Video, Youtube as YoutubeIcon } from 'lucide-react'

type EmbedKind = 'figma' | 'loom' | 'youtube' | 'generic'

export type Embed = {
  url: string
  title: string
  description?: string
  thumbnail?: string
  kind: EmbedKind
  duration?: string
  meta?: Record<string, string>
}

const KIND_META: Record<EmbedKind, { label: string; icon: React.ElementType; cover: string; brand: string }> = {
  figma: {
    label: 'Figma',
    icon: FigmaIcon,
    cover: 'linear-gradient(135deg, #F24E1E, #A259FF)',
    brand: '#F24E1E',
  },
  loom: {
    label: 'Loom',
    icon: Video,
    cover: 'linear-gradient(135deg, #625DF5, #FF4444)',
    brand: '#625DF5',
  },
  youtube: {
    label: 'YouTube',
    icon: YoutubeIcon,
    cover: 'linear-gradient(135deg, #FF0000, #C4302B)',
    brand: '#FF0000',
  },
  generic: {
    label: 'Link',
    icon: ExternalLink,
    cover: 'linear-gradient(135deg, hsl(217 60% 55%), hsl(268 88% 60%))',
    brand: '#354fb0',
  },
}

export function EmbedCard({ embed }: { embed: Embed }) {
  const meta = KIND_META[embed.kind]
  const Icon = meta.icon
  return (
    <a
      href={embed.url}
      target="_blank"
      rel="noreferrer"
      className="block group"
    >
      <Card variant="glass" className="overflow-hidden p-0 transition-all hover:shadow-glow hover:border-accent/40">
        <div
          className="relative aspect-video overflow-hidden flex items-center justify-center"
          style={{ background: meta.cover }}
        >
          <div className="absolute inset-0 bg-grid-dim opacity-30" />
          {embed.thumbnail ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${embed.thumbnail})` }}
            />
          ) : (
            <Icon className="h-10 w-10 text-white/90 relative z-10" />
          )}
          {(embed.kind === 'loom' || embed.kind === 'youtube') && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/30">
                <Play className="h-6 w-6 fill-white text-white ml-0.5" />
              </div>
            </div>
          )}
          {embed.duration && (
            <Badge variant="soft" className="absolute top-2 right-2 text-[10px] backdrop-blur-sm bg-black/60 text-white border-transparent">
              {embed.duration}
            </Badge>
          )}
          <div
            className="absolute top-2 left-2 flex h-6 items-center gap-1.5 rounded-md backdrop-blur-sm bg-black/40 text-white px-2 text-[10px] font-medium"
          >
            <Icon className="h-3 w-3" />
            {meta.label}
          </div>
        </div>
        <div className="p-3">
          <div className="font-medium text-sm truncate">{embed.title}</div>
          {embed.description && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {embed.description}
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-2 truncate">
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{new URL(embed.url).hostname}</span>
          </div>
        </div>
      </Card>
    </a>
  )
}

/** Auto-detect embed kind from URL. */
export function detectEmbed(url: string): EmbedKind {
  try {
    const u = new URL(url)
    if (u.hostname.includes('figma.com')) return 'figma'
    if (u.hostname.includes('loom.com')) return 'loom'
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) return 'youtube'
    return 'generic'
  } catch {
    return 'generic'
  }
}

/** Stack of demo embeds — useful for the task detail sheet attachments tab. */
export function EmbedShowcase() {
  const embeds: Embed[] = [
    {
      kind: 'figma',
      url: 'https://www.figma.com/file/abc/onboarding-flow',
      title: 'Onboarding flow — design system',
      description: '14 frames covering the multi-step signup and welcome screens.',
      meta: { frames: '14' },
    },
    {
      kind: 'loom',
      url: 'https://www.loom.com/share/abc123',
      title: 'Onboarding walkthrough by Hamda',
      duration: '3:42',
      description: 'Walking through every screen and explaining the rationale.',
    },
    {
      kind: 'youtube',
      url: 'https://www.youtube.com/watch?v=abc',
      title: 'How we shipped Rundesk in 90 days',
      duration: '12:08',
      description: 'Internal team retro on the V1 launch.',
    },
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {embeds.map((e) => (
        <EmbedCard key={e.url} embed={e} />
      ))}
    </div>
  )
}
