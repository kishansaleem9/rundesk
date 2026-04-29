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
  Label,
  Switch,
  Badge,
  cn,
} from '@rundesk/ui'
import { Shield, Check } from 'lucide-react'

type Permission = {
  key: string
  label: string
  description?: string
}

const PERM_GROUPS: { name: string; perms: Permission[] }[] = [
  {
    name: 'Workspace',
    perms: [
      { key: 'workspace.invite', label: 'Invite members' },
      { key: 'workspace.remove', label: 'Remove members' },
      { key: 'workspace.billing', label: 'Manage billing' },
      { key: 'workspace.delete', label: 'Delete workspace' },
    ],
  },
  {
    name: 'Projects',
    perms: [
      { key: 'project.create', label: 'Create projects' },
      { key: 'project.archive', label: 'Archive projects' },
      { key: 'project.delete', label: 'Delete projects' },
      { key: 'project.share_public', label: 'Share publicly', description: 'Generate read-only public links' },
    ],
  },
  {
    name: 'Tasks',
    perms: [
      { key: 'task.create', label: 'Create tasks' },
      { key: 'task.edit_any', label: 'Edit any task', description: 'Even tasks they don\'t own' },
      { key: 'task.delete', label: 'Delete tasks' },
      { key: 'task.assign_others', label: 'Assign to others' },
    ],
  },
  {
    name: 'AI',
    perms: [
      { key: 'ai.use', label: 'Use AI features' },
      { key: 'ai.generate_tasks', label: 'Generate tasks with AI' },
      { key: 'ai.unlimited_credits', label: 'Unlimited credits' },
    ],
  },
  {
    name: 'Reports & data',
    perms: [
      { key: 'reports.view_all', label: 'View all reports' },
      { key: 'reports.export', label: 'Export data (CSV/PDF)' },
      { key: 'audit.view', label: 'View audit log' },
    ],
  },
]

export function CustomRolesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [name, setName] = useState('Marketing lead')
  const [description, setDescription] = useState('Can manage marketing projects, but no billing access.')
  const [color, setColor] = useState('#A855F7')
  const [perms, setPerms] = useState<Set<string>>(
    new Set([
      'project.create',
      'project.archive',
      'task.create',
      'task.edit_any',
      'task.assign_others',
      'ai.use',
      'ai.generate_tasks',
      'reports.view_all',
      'reports.export',
    ]),
  )

  function toggle(key: string) {
    setPerms((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden grid grid-rows-[auto_1fr_auto] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-white shadow-sm"
              style={{ background: color }}
            >
              <Shield className="h-3.5 w-3.5" />
            </span>
            Custom role
          </DialogTitle>
          <DialogDescription>
            Build a permission set tailored to how this team works.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto px-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
            <div className="space-y-2">
              <Label>Role name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-md border border-border/60 bg-card"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary shown when picking the role"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>Permissions</span>
              <Badge variant="soft" className="text-[10px]">
                {perms.size} selected
              </Badge>
            </div>
            {PERM_GROUPS.map((g) => (
              <div key={g.name} className="rounded-lg border border-border/40 bg-card/30">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.name}
                  </span>
                  <button
                    onClick={() => {
                      const all = g.perms.every((p) => perms.has(p.key))
                      setPerms((s) => {
                        const n = new Set(s)
                        if (all) g.perms.forEach((p) => n.delete(p.key))
                        else g.perms.forEach((p) => n.add(p.key))
                        return n
                      })
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {g.perms.every((p) => perms.has(p.key)) ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <ul className="divide-y divide-border/30">
                  {g.perms.map((p) => (
                    <li
                      key={p.key}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 transition-colors cursor-pointer hover:bg-card/40',
                        perms.has(p.key) && 'bg-accent/5',
                      )}
                      onClick={() => toggle(p.key)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{p.label}</div>
                        {p.description && (
                          <div className="text-[11px] text-muted-foreground">{p.description}</div>
                        )}
                      </div>
                      <Switch
                        checked={perms.has(p.key)}
                        onCheckedChange={() => toggle(p.key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="border-t border-border/40 bg-card/30 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="gradient" onClick={() => onOpenChange(false)}>
            <Check className="h-3.5 w-3.5" /> Create role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
