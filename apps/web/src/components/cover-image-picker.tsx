import { useState } from 'react'
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
import { Upload, Sparkles, Image as ImageIcon, Search, Check } from 'lucide-react'
import { useTranslation } from '../lib/i18n'

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

// Mock unsplash-like options (use named gradients as placeholders).
// `labelKey` references an i18n catalog entry; `bg` is a locale-independent CSS value.
const PHOTOS = [
  { id: 1, labelKey: 'coverImage.photo.mountains', bg: 'linear-gradient(180deg, hsl(217 70% 25%), hsl(0 70% 65%) 60%, hsl(45 90% 75%))' },
  { id: 2, labelKey: 'coverImage.photo.forest', bg: 'linear-gradient(180deg, hsl(140 50% 25%), hsl(120 40% 50%) 60%, hsl(60 50% 80%))' },
  { id: 3, labelKey: 'coverImage.photo.ocean', bg: 'linear-gradient(180deg, hsl(217 70% 25%), hsl(190 80% 50%) 60%, hsl(180 60% 85%))' },
  { id: 4, labelKey: 'coverImage.photo.desert', bg: 'linear-gradient(180deg, hsl(35 80% 50%), hsl(25 70% 65%) 60%, hsl(15 60% 85%))' },
  { id: 5, labelKey: 'coverImage.photo.aurora', bg: 'linear-gradient(180deg, hsl(240 50% 10%), hsl(160 70% 50%) 50%, hsl(280 60% 70%))' },
  { id: 6, labelKey: 'coverImage.photo.city', bg: 'linear-gradient(180deg, hsl(220 40% 15%), hsl(220 30% 35%) 60%, hsl(35 90% 65%))' },
] as const

export function CoverImagePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onPick?: (cover: string) => void
}) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<string | null>(null)
  const [tab, setTab] = useState<'gradients' | 'photos' | 'upload' | 'ai'>('gradients')

  function commit(value: string) {
    setPicked(value)
    onPick?.(value)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-accent" />
            {t('coverImage.title')}
          </DialogTitle>
          <DialogDescription>
            {t('coverImage.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="gradients">{t('coverImage.tab.gradients')}</TabsTrigger>
              <TabsTrigger value="photos">{t('coverImage.tab.photos')}</TabsTrigger>
              <TabsTrigger value="upload">{t('coverImage.tab.upload')}</TabsTrigger>
              <TabsTrigger value="ai">{t('coverImage.tab.ai')}</TabsTrigger>
            </TabsList>

            <TabsContent value="gradients">
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {GRADIENTS.map((g) => (
                  <button
                    key={g}
                    onClick={() => commit(g)}
                    className={cn(
                      'aspect-[5/3] rounded-lg border-2 transition-all relative overflow-hidden',
                      picked === g ? 'border-accent shadow-glow' : 'border-transparent hover:border-border',
                    )}
                    style={{ background: g }}
                  >
                    <div className="absolute inset-0 bg-grid-dim opacity-30" />
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="photos">
              <Input leadingIcon={<Search className="h-4 w-4" />} placeholder={t('coverImage.searchUnsplash')} className="mb-3" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[320px] overflow-auto">
                {PHOTOS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => commit(p.bg)}
                    className={cn(
                      'aspect-[5/3] rounded-lg border-2 transition-all relative overflow-hidden text-left',
                      picked === p.bg ? 'border-accent shadow-glow' : 'border-transparent hover:border-border',
                    )}
                    style={{ background: p.bg }}
                  >
                    <span className="absolute bottom-1.5 left-2 text-[10px] text-white/90 font-medium drop-shadow">{t(p.labelKey)}</span>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="upload">
              <button className="w-full rounded-lg border-2 border-dashed border-border/60 bg-card/40 hover:bg-card/60 transition-colors py-12 flex flex-col items-center justify-center gap-2">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <div className="text-sm font-medium">{t('coverImage.uploadPrompt')}</div>
                <div className="text-xs text-muted-foreground">{t('coverImage.uploadHint')}</div>
              </button>
            </TabsContent>

            <TabsContent value="ai">
              <div className="rounded-lg border border-border/60 bg-card/30 p-4 space-y-3">
                <Input
                  leadingIcon={<Sparkles className="h-4 w-4" />}
                  placeholder={t('coverImage.aiPlaceholder')}
                  defaultValue={t('coverImage.aiDefaultPrompt')}
                />
                <Button variant="gradient" className="w-full">
                  <Sparkles className="h-4 w-4" /> {t('coverImage.generateCover')}
                </Button>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {GRADIENTS.slice(0, 3).map((g, i) => (
                    <button
                      key={i}
                      onClick={() => commit(g)}
                      className="aspect-[5/3] rounded-lg overflow-hidden border-2 border-transparent hover:border-accent transition-all relative"
                      style={{ background: g }}
                    >
                      <div className="absolute inset-0 bg-grid-dim opacity-30" />
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="border-t border-border/40 bg-card/30 px-6 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => commit('')}>
            {t('coverImage.removeCover')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="gradient" size="sm" disabled={!picked} onClick={() => picked && commit(picked)}>
              <Check className="h-3.5 w-3.5" /> {t('coverImage.saveCover')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
