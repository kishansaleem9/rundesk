/**
 * The reporting lines drawn out.
 *
 * EXTRACTED, NOT COPIED. This was a local function inside the workspace
 * settings page, reachable only by admins. §V2-12 needs the same tree on a
 * destination any member can open, and the two hard parts of it — people whose
 * manager is not in the list, and cycles — are exactly the parts a second copy
 * would get subtly wrong. One implementation, two call sites.
 *
 * Only shown once somebody actually has a manager: an org chart of one flat
 * level is just the roster again.
 */

import type { ReactNode } from 'react'
import { Card } from '@rundesk/ui'
import { useTranslation } from '../lib/i18n'

export type ReportingMember = {
  userId: string
  displayName: string
  managerId?: string | null
}

export function ReportingTree({
  members,
  className,
}: {
  members: ReportingMember[]
  className?: string
}) {
  const { t } = useTranslation()
  if (!members.some((m) => m.managerId)) return null

  const known = new Set(members.map((m) => m.userId))
  const childrenOf = new Map<string, ReportingMember[]>()
  const roots: ReportingMember[] = []
  for (const m of members) {
    /*
     * Anyone whose manager is not in the list renders at the ROOT rather than
     * disappearing, which is what makes this safe to show while the lines are
     * half filled in — and while a member is looking at a list their own
     * permissions may have trimmed.
     */
    const parent = m.managerId && known.has(m.managerId) ? m.managerId : null
    if (!parent) roots.push(m)
    else childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), m])
  }

  // A cycle is rejected on the way in, but a row inserted before that guard
  // existed would loop forever here. Visiting each person at most once bounds it.
  const drawn = new Set<string>()
  const render = (node: ReportingMember, depth: number): ReactNode => {
    if (drawn.has(node.userId)) return null
    drawn.add(node.userId)
    const kids = childrenOf.get(node.userId) ?? []
    return (
      <li key={node.userId}>
        <div className="flex items-center gap-2 py-1 text-sm" style={{ paddingLeft: `${depth * 18}px` }}>
          {depth > 0 && <span className="select-none text-muted-foreground/50">└</span>}
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-300 text-[10px] font-semibold text-foreground">
            {node.displayName.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{node.displayName}</span>
          {kids.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {t('settings.reportsCount', { count: String(kids.length) })}
            </span>
          )}
        </div>
        {kids.length > 0 && <ul>{kids.map((k) => render(k, depth + 1))}</ul>}
      </li>
    )
  }

  return (
    <Card className={className} data-testid="reporting-tree">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{t('settings.reportingStructure')}</h2>
        <p className="text-xs text-muted-foreground">{t('settings.reportingStructureDesc')}</p>
      </div>
      <ul className="px-4 py-3">{roots.map((r) => render(r, 0))}</ul>
    </Card>
  )
}
