import { Fragment, useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, Input, PersonAvatar, cn, type BadgeProps } from '@rundesk/ui'
import { BadgeCheck, Building2, ChevronDown, Globe, Search, ShieldAlert } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'

const PAGE_SIZE = 25

type DirectoryWorkspace = {
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  role: string
}

type DirectoryUser = {
  id: string
  displayName: string
  email: string
  avatarUrl: string | null
  role: string
  emailVerified: boolean
  isActive: boolean
  lastSeenAt: string | null
  createdAt: string
  workspaces: DirectoryWorkspace[]
}

type DirectoryResult = {
  users: DirectoryUser[]
  total: number
  limit: number
  offset: number
}

// `role` is the locale-independent identifier (userRoleEnum) from the API; the
// value maps to an i18n label + a badge variant for display only.
const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  super_admin: 'adminDirectory.role.superAdmin',
  workspace_admin: 'adminDirectory.role.workspaceAdmin',
  manager: 'adminDirectory.role.manager',
  member: 'adminDirectory.role.member',
  guest: 'adminDirectory.role.guest',
}

const ROLE_VARIANTS: Record<string, BadgeProps['variant']> = {
  super_admin: 'gradient',
  workspace_admin: 'info',
  manager: 'normal',
  member: 'soft',
  guest: 'outline',
}

export function AdminDirectoryPage() {
  const { t, tCount } = useTranslation()
  const [search, setSearch] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Debounce the search box and reset to the first page when the query changes.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQ(search.trim())
      setOffset(0)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const query = useQuery({
    queryKey: ['admin-directory', debouncedQ, offset],
    queryFn: () =>
      api<DirectoryResult>(
        `/organizations/users?q=${encodeURIComponent(debouncedQ)}&limit=${PAGE_SIZE}&offset=${offset}`,
      ),
    placeholderData: keepPreviousData,
  })

  const roleLabel = (role: string) => {
    const key = ROLE_LABEL_KEYS[role]
    return key ? t(key) : role
  }

  const users = query.data?.users ?? []
  const total = query.data?.total ?? 0
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE_SIZE, total)

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Globe className="h-5 w-5 text-accent" />
            {t('adminDirectory.title')}
          </h1>
          <Badge variant="info" className="gap-1">
            <Globe className="h-3 w-3" />
            {t('adminDirectory.scopeBadge')}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t('adminDirectory.subtitle')}</p>
        <p className="text-xs text-muted-foreground/80">{t('adminDirectory.distinctionHint')}</p>
      </header>

      <Card className="p-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('adminDirectory.searchPlaceholder')}
          leadingIcon={<Search className="h-4 w-4" />}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-medium flex items-center justify-between gap-2">
          <span>{tCount('adminDirectory.resultsCount', total)}</span>
          {query.isFetching && (
            <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
          )}
        </div>

        {query.isLoading ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">{t('adminDirectory.loading')}</div>
        ) : query.isError ? (
          <div className="px-4 py-8 text-sm text-destructive">{t('adminDirectory.loadError')}</div>
        ) : users.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>{t('adminDirectory.empty')}</p>
            <p className="text-xs mt-1">{t('adminDirectory.emptyHint')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t('adminDirectory.colUser')}</th>
                  <th className="px-4 py-2 font-medium">{t('adminDirectory.colRole')}</th>
                  <th className="px-4 py-2 font-medium">{t('adminDirectory.colWorkspaces')}</th>
                  <th className="px-4 py-2 font-medium">{t('adminDirectory.colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => {
                  const isOpen = expanded.has(u.id)
                  const wsCount = u.workspaces.length
                  return (
                    <Fragment key={u.id}>
                      <tr className={cn('align-top', !u.isActive && 'opacity-60')}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <PersonAvatar name={u.displayName} imageUrl={u.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <div className="font-medium truncate flex items-center gap-1.5">
                                {u.displayName}
                                {!u.isActive && (
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                    · {t('adminDirectory.inactive')}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={ROLE_VARIANTS[u.role] ?? 'soft'}
                            className={u.role === 'super_admin' ? 'gap-1' : undefined}
                          >
                            {u.role === 'super_admin' && <ShieldAlert className="h-3 w-3" />}
                            {roleLabel(u.role)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {wsCount === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {t('adminDirectory.noWorkspaces')}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggle(u.id)}
                              aria-expanded={isOpen}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted/40 transition-colors"
                            >
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              {tCount('adminDirectory.workspacesCount', wsCount)}
                              <ChevronDown
                                className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')}
                              />
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {u.emailVerified ? (
                              <Badge variant="success" className="gap-1 w-fit">
                                <BadgeCheck className="h-3 w-3" />
                                {t('adminDirectory.verified')}
                              </Badge>
                            ) : (
                              <Badge variant="soft" className="w-fit">
                                {t('adminDirectory.unverified')}
                              </Badge>
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              {u.lastSeenAt
                                ? t('adminDirectory.lastSeen', {
                                    when: new Date(u.lastSeenAt).toLocaleDateString(),
                                  })
                                : t('adminDirectory.lastSeenNever')}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {isOpen && wsCount > 0 && (
                        <tr className="bg-muted/20">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {u.workspaces.map((w) => (
                                <span
                                  key={w.workspaceId}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs"
                                >
                                  <Building2 className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium">{w.workspaceName}</span>
                                  <span className="text-muted-foreground">· {roleLabel(w.role)}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {t('adminDirectory.pageInfo', { from, to, total })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0}
            >
              {t('adminDirectory.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              disabled={to >= total}
            >
              {t('adminDirectory.next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
