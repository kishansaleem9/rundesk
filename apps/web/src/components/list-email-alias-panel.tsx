import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from '@rundesk/ui'
import { Check, Copy, Mail, RefreshCcw, Trash2 } from 'lucide-react'
import { api } from '../lib/api'

type Alias = {
  id: string
  listId: string
  localPart: string
  address: string
  defaultPriority: string
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

/**
 * Per-list inbound email panel. Lets the list owner mint, copy, rotate, or
 * revoke the address that turns inbound emails into tasks.
 */
export function ListEmailAliasPanel({
  listId,
  open,
  onOpenChange,
}: {
  listId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  const { data: alias, refetch } = useQuery({
    queryKey: ['list-email-alias', listId],
    queryFn: () => api<Alias | null>(`/lists/${listId}/inbound-email`),
    enabled: open,
  })

  const ensure = useMutation({
    mutationFn: () => api<Alias>(`/lists/${listId}/inbound-email`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['list-email-alias', listId] }),
  })

  const rotate = useMutation({
    mutationFn: () => api<Alias>(`/lists/${listId}/inbound-email/rotate`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['list-email-alias', listId] }),
  })

  const revoke = useMutation({
    mutationFn: () => api(`/lists/${listId}/inbound-email`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['list-email-alias', listId] }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-gradient text-white shadow-sm">
              <Mail className="h-3.5 w-3.5" />
            </span>
            Email to task
          </DialogTitle>
          <DialogDescription>
            Send an email to this address and Rundesk will create a task in
            this list. Replies to notifications become comments on the task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {alias ? (
            <AliasRow
              address={alias.address}
              onRotate={() => rotate.mutate()}
              onRevoke={() => revoke.mutate()}
              rotating={rotate.isPending}
              revoking={revoke.isPending}
            />
          ) : (
            <div className="rounded-md border border-dashed border-border/70 p-4 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">No inbound email address yet</span>
              <Button size="sm" onClick={() => ensure.mutate()} disabled={ensure.isPending}>
                {ensure.isPending ? 'Minting…' : 'Generate address'}
              </Button>
            </div>
          )}

          {alias && (
            <div className="rounded-md border border-border/50 bg-card/40 p-3 text-xs text-muted-foreground space-y-1">
              <div>
                Default priority: <span className="font-medium text-foreground">{alias.defaultPriority}</span>
              </div>
              {alias.lastUsedAt && (
                <div>
                  Last received: <span className="font-medium text-foreground">{new Date(alias.lastUsedAt).toLocaleString()}</span>
                </div>
              )}
              <div className="pt-1">
                Subject becomes the task title, body becomes the description,
                attachments are saved as task files. The first email creates
                the task; later replies (or emails to{' '}
                <code className="font-mono">list-…+task-&lt;id&gt;@</code>)
                become comments.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void refetch()}>Refresh</Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AliasRow({
  address,
  onRotate,
  onRevoke,
  rotating,
  revoking,
}: {
  address: string
  onRotate: () => void
  onRevoke: () => void
  rotating: boolean
  revoking: boolean
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable; the input is already pre-selected
    }
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        value={address}
        onFocus={(e) => e.currentTarget.select()}
        className="h-8 text-xs font-mono"
      />
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={onRotate}
        disabled={rotating}
        title="Generate a new address — old one stops working"
      >
        <RefreshCcw className={cn('h-3.5 w-3.5', rotating && 'animate-spin')} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs text-rose-600 hover:text-rose-700"
        onClick={onRevoke}
        disabled={revoking}
        title="Disable inbound email for this list"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
