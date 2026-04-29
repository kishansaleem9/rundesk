import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Switch,
  Badge,
  Label,
  toast,
  cn,
} from '@rundesk/ui'
import { Globe, Lock, Copy, Mail, Plus, Trash2, Eye, Edit, Check } from 'lucide-react'

type Permission = 'view' | 'comment' | 'edit'

type Sharee = { email: string; permission: Permission }

export function ShareDialog({
  open,
  onOpenChange,
  itemKind = 'task',
  itemTitle = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemKind?: 'task' | 'list' | 'project' | 'doc' | 'dashboard'
  itemTitle?: string
}) {
  const [publicEnabled, setPublicEnabled] = useState(false)
  const [publicPermission, setPublicPermission] = useState<Permission>('view')
  const [sharees, setSharees] = useState<Sharee[]>([
    { email: 'hamda@rundesk.io', permission: 'edit' },
  ])
  const [emailDraft, setEmailDraft] = useState('')
  const [permDraft, setPermDraft] = useState<Permission>('view')

  const link = `https://rundesk.app/share/${itemKind}/8a4f9c2e-${itemKind === 'task' ? 'rd348e' : 'public'}`

  function addSharee() {
    if (!/^.+@.+\..+$/.test(emailDraft)) return
    setSharees((s) => [...s, { email: emailDraft, permission: permDraft }])
    setEmailDraft('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {itemKind}</DialogTitle>
          <DialogDescription>
            {itemTitle && <span className="font-medium text-foreground">{itemTitle}</span>}
            {itemTitle && <span> — </span>}
            Invite your team or anyone with the link.
          </DialogDescription>
        </DialogHeader>

        {/* Public toggle */}
        <div className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
                {publicEnabled ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </div>
              <div>
                <div className="text-sm font-medium">
                  {publicEnabled ? 'Anyone with the link' : 'Workspace only'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {publicEnabled
                    ? `Anyone with the link can ${publicPermission}`
                    : 'Only invited people can access'}
                </div>
              </div>
            </div>
            <Switch checked={publicEnabled} onCheckedChange={setPublicEnabled} />
          </div>

          {publicEnabled && (
            <div className="flex items-center gap-2 animate-fade-in">
              <PermPicker value={publicPermission} onChange={setPublicPermission} />
              <div className="flex-1 flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1.5">
                <span className="text-xs text-muted-foreground truncate font-mono">{link}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(link)
                  toast.success('Link copied')
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          )}
        </div>

        {/* Invite by email */}
        <div className="space-y-3">
          <Label>Invite by email</Label>
          <div className="flex items-center gap-2">
            <Input
              leadingIcon={<Mail className="h-4 w-4" />}
              placeholder="teammate@company.com"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSharee()}
            />
            <PermPicker value={permDraft} onChange={setPermDraft} />
            <Button variant="outline" size="sm" onClick={addSharee}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {sharees.length > 0 && (
            <ul className="space-y-1.5">
              {sharees.map((s) => (
                <li
                  key={s.email}
                  className="flex items-center gap-2 rounded-md border border-border/40 bg-card/30 px-2.5 py-1.5"
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate text-sm">{s.email}</span>
                  <Badge variant="soft" className="text-[10px] capitalize">
                    {s.permission}
                  </Badge>
                  <button
                    onClick={() => setSharees((arr) => arr.filter((x) => x.email !== s.email))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button variant="gradient" onClick={() => { toast.success('Invitations sent'); onOpenChange(false) }}>
            <Check className="h-3.5 w-3.5" /> Send invites
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PermPicker({ value, onChange }: { value: Permission; onChange: (p: Permission) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-card/40 border border-border/60 rounded-md p-0.5">
      {[
        { v: 'view' as const, label: 'View', icon: Eye },
        { v: 'comment' as const, label: 'Comment', icon: Mail },
        { v: 'edit' as const, label: 'Edit', icon: Edit },
      ].map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'text-[11px] px-2 py-1 rounded font-medium transition-all flex items-center gap-1',
            value === o.v
              ? 'bg-accent/15 text-accent'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <o.icon className="h-3 w-3" />
          {o.label}
        </button>
      ))}
    </div>
  )
}
