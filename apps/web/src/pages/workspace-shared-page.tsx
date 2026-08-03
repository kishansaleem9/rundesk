import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, EmptyState, Badge, PersonAvatar } from '@rundesk/ui'
import {
  Users,
  Layers,
  Folder,
  FolderOpen,
  ClipboardList,
  CheckSquare,
  FileText,
  Hash,
  LayoutDashboard,
} from 'lucide-react'
import { api } from '../lib/api'
import { goToDestination } from '../lib/notification-nav'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type ShareObjectType = 'space' | 'folder' | 'project' | 'list' | 'task' | 'doc' | 'channel' | 'dashboard'
type ShareLevel = 'view' | 'comment' | 'edit' | 'admin'

type SharedItem = {
  id: string
  objectType: ShareObjectType
  objectId: string
  level: ShareLevel
  name: string
  url: string
  context: string | null
  sharedAt: string
  sharedBy: { id: string; name: string; avatarUrl: string | null } | null
}

const TYPE_ICON: Record<ShareObjectType, React.ElementType> = {
  space: Layers,
  folder: Folder,
  project: FolderOpen,
  list: ClipboardList,
  task: CheckSquare,
  doc: FileText,
  channel: Hash,
  dashboard: LayoutDashboard,
}

const TYPE_LABEL_KEY: Record<ShareObjectType, TranslationKey> = {
  space: 'shared.typeSpace',
  folder: 'shared.typeFolder',
  project: 'shared.typeProject',
  list: 'shared.typeList',
  task: 'shared.typeTask',
  doc: 'shared.typeDoc',
  channel: 'shared.typeChannel',
  dashboard: 'shared.typeDashboard',
}

// The same four levels the share dialog names, so a grant reads identically
// wherever you meet it.
const LEVEL_LABEL_KEY: Record<ShareLevel, TranslationKey> = {
  view: 'share.levelView',
  comment: 'share.levelComment',
  edit: 'share.levelEdit',
  admin: 'share.levelFull',
}

/**
 * A1.7 — the only way to find something that was shared with you privately.
 * `object_shares` was always readable forwards (who can see *this* object); the
 * new workspace-scoped route reads it backwards, and this page groups the
 * result by who did the sharing, which is how people remember it ("Ada sent me
 * that list").
 */
export function SharedWithMePage() {
  const navigate = useNavigate()
  const { t, tCount, locale } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/shared' })

  const sharedQuery = useQuery({
    queryKey: ['shared-with-me', workspaceId],
    queryFn: () => api<SharedItem[]>(`/workspaces/${workspaceId}/shared-with-me`),
    enabled: !!workspaceId,
  })
  const items = sharedQuery.data ?? []

  // Preserve the API's newest-first order: the first grant a person appears in
  // decides where their group sits.
  const groups: Array<{ key: string; name: string; avatarUrl: string | null; items: SharedItem[] }> = []
  const groupByKey = new Map<string, (typeof groups)[number]>()
  for (const item of items) {
    const key = item.sharedBy?.id ?? '__unknown__'
    let group = groupByKey.get(key)
    if (!group) {
      group = {
        key,
        name: item.sharedBy?.name || t('shared.unknownSharer'),
        avatarUrl: item.sharedBy?.avatarUrl ?? null,
        items: [],
      }
      groupByKey.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t('nav.browse')}</div>
            <h1 className="font-display text-2xl font-semibold leading-tight">{t('shared.title')}</h1>
          </div>
          {items.length > 0 && (
            <Badge variant="gradient" className="ml-auto text-[10px]">
              {tCount('shared.itemCount', items.length)}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">{t('shared.subtitle')}</p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {sharedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : groups.length === 0 ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title={t('shared.emptyTitle')}
              description={t('shared.emptyDesc')}
            />
          ) : (
            groups.map((group) => (
              <section key={group.key} className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <PersonAvatar name={group.name} size="sm" />
                  <h2 className="text-sm font-medium">{t('shared.sharedBy', { name: group.name })}</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">{group.items.length}</span>
                </div>
                {group.items.map((item) => {
                  const Icon = TYPE_ICON[item.objectType]
                  return (
                    <Card
                      key={item.id}
                      variant="glass"
                      onClick={() => goToDestination(navigate, item.url)}
                      className="p-3 flex items-center gap-3 hover:border-accent/30 transition-all cursor-pointer"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">{item.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t(TYPE_LABEL_KEY[item.objectType])}
                          {item.context ? ` · ${item.context}` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {t(LEVEL_LABEL_KEY[item.level])}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums hidden sm:inline">
                        {new Date(item.sharedAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
                      </span>
                    </Card>
                  )
                })}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
