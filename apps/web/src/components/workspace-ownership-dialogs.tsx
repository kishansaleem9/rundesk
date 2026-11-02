/*
 * LEAVE, TRANSFER, DELETE — the three things a person does to a workspace as a
 * whole, as ClickUp offers them (QA WS-015 to WS-019;
 * `found-02-nov/workspace-leave-unbuilt`, `…/workspace-transfer-unbuilt`,
 * `…/workspace-has-no-owner`). Each asks before it acts, and the two that
 * cannot be taken back by a click ask for the workspace's name, typed exactly,
 * with the button off until it is (WS-019). Opened from Settings › General's
 * Danger zone and from Profile › Workspaces.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label, toast } from '@rundesk/ui'
import { api, refusalMessage } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useAuthStore } from '../store/auth'
import { goToAnotherWorkspace } from '../lib/workspace-exit'

type Named = { id: string; name: string }

function useExit() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const setWorkspaces = useAuthStore((s) => s.setWorkspaces)
  return (goneId: string) => goToAnotherWorkspace(goneId, { qc, setWorkspaces, navigate: (to) => navigate(to) })
}

/**
 * LEAVE A WORKSPACE (QA WS-015), or, for its owner, why not yet (WS-016:
 * "blocked with message to transfer ownership first") — and where to do that.
 */
export function LeaveWorkspaceDialog({ workspace, isOwner, onClose }: { workspace: Named; isOwner: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const exit = useExit()
  const leave = useMutation({
    mutationFn: () => api(`/workspaces/${workspace.id}/leave`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('workspace.leftToast', { name: workspace.name }))
      onClose()
      await exit(workspace.id)
    },
    onError: (e) => toast.error(refusalMessage(e, t('workspace.leaveFailed'))),
  })
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md" data-testid="leave-workspace-dialog">
        <DialogHeader>
          <DialogTitle>{isOwner ? t('workspace.leaveOwnerTitle') : t('workspace.leaveTitle', { name: workspace.name })}</DialogTitle>
        </DialogHeader>
        {isOwner ? (
          <>
            <p className="text-sm text-muted-foreground" data-testid="leave-workspace-owner">{t('workspace.leaveOwnerBody', { name: workspace.name })}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>
              <Button
                size="sm"
                data-testid="leave-workspace-to-transfer"
                onClick={() => {
                  onClose()
                  navigate({ to: '/app/$workspaceId/settings', params: { workspaceId: workspace.id } })
                }}
              >
                {t('workspace.openSettings')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('workspace.leaveBody', { name: workspace.name })}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
              <Button
                variant="destructive"
                size="sm"
                data-testid="leave-workspace-confirm"
                disabled={leave.isPending}
                onClick={() => leave.mutate()}
              >
                {leave.isPending ? t('workspace.leaving') : t('workspace.leaveConfirm')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * DELETE A WORKSPACE (QA WS-018, WS-019): its owner's, with its name typed
 * exactly, the button off until it is. It is archived — out of every list,
 * opened by nobody — and its owner restores it from Settings › Archived, or
 * deletes it for good there; and whoever deleted it goes to another workspace.
 */
export function DeleteWorkspaceDialog({ workspace, onClose }: { workspace: Named; onClose: () => void }) {
  const { t } = useTranslation()
  const exit = useExit()
  const [typed, setTyped] = useState('')
  const remove = useMutation({
    mutationFn: () => api(`/workspaces/${workspace.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('settings.deletedToast', { name: workspace.name }))
      onClose()
      await exit(workspace.id)
    },
    onError: (e) => toast.error(refusalMessage(e, t('settings.deleteFailed'))),
  })
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md" data-testid="delete-workspace-dialog">
        <DialogHeader>
          <DialogTitle>{t('settings.deleteDialogTitle', { name: workspace.name })}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('settings.deleteDialogBody')}</p>
        <Label className="text-xs" htmlFor="delete-workspace-name">{t('settings.typeNameToConfirm', { name: workspace.name })}</Label>
        <Input
          id="delete-workspace-name"
          data-testid="delete-workspace-name"
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="destructive"
            size="sm"
            data-testid="delete-workspace-confirm"
            disabled={typed !== workspace.name || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? t('settings.deleting') : t('settings.deleteButton')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type RosterRow = { userId: string; displayName: string; email: string; role: string; isOwner?: boolean }

/**
 * TRANSFER A WORKSPACE'S OWNERSHIP (QA WS-017: "New Owner gets Owner rights;
 * previous Owner becomes Admin"): to a member who is not a guest, with its name
 * typed exactly. The new owner is made an admin; the previous one stays one.
 */
export function TransferOwnershipDialog({ workspace, onClose }: { workspace: Named; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [to, setTo] = useState('')
  const [typed, setTyped] = useState('')
  const roster = useQuery({
    queryKey: ['workspace-members', workspace.id],
    queryFn: () => api<RosterRow[]>(`/workspaces/${workspace.id}/members`),
  })
  const candidates = (roster.data ?? []).filter((m) => !m.isOwner && m.role !== 'guest')
  const picked = candidates.find((m) => m.userId === to)
  const transfer = useMutation({
    mutationFn: () => api(`/workspaces/${workspace.id}/transfer-ownership`, { method: 'POST', body: { userId: to, confirmName: typed } }),
    onSuccess: async () => {
      toast.success(t('settings.transferDone', { name: picked?.displayName || picked?.email || '' }))
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['workspace', workspace.id] }),
        qc.invalidateQueries({ queryKey: ['workspace-members', workspace.id] }),
        qc.invalidateQueries({ queryKey: ['workspaces'] }),
      ])
      onClose()
    },
    onError: (e) => toast.error(refusalMessage(e, t('settings.transferFailed'))),
  })
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md" data-testid="transfer-owner-dialog">
        <DialogHeader>
          <DialogTitle>{t('settings.transferTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('settings.transferDesc')}</p>
        {roster.isSuccess && candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="transfer-owner-nobody">{t('settings.transferNoOne')}</p>
        ) : (
          <>
            <Label className="text-xs" htmlFor="transfer-owner-pick">{t('settings.transferPick')}</Label>
            <select
              id="transfer-owner-pick"
              data-testid="transfer-owner-pick"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="">{t('settings.transferPickPlaceholder')}</option>
              {candidates.map((m) => (
                <option key={m.userId} value={m.userId}>{m.displayName ? `${m.displayName} · ${m.email}` : m.email}</option>
              ))}
            </select>
            <Label className="text-xs" htmlFor="transfer-owner-name">{t('settings.typeNameToConfirm', { name: workspace.name })}</Label>
            <Input
              id="transfer-owner-name"
              data-testid="transfer-owner-name"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            size="sm"
            data-testid="transfer-owner-confirm"
            disabled={!picked || typed !== workspace.name || transfer.isPending}
            onClick={() => transfer.mutate()}
          >
            {transfer.isPending ? t('settings.transferring') : t('settings.transferButton')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
