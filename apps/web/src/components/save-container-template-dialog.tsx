import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  toast,
} from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'

/** What the sidebar asks to save: a list alone, or a folder (a project) with its lists. */
export type ContainerToSave = { kind: 'list' | 'project'; id: string; projectId: string; name: string }

/**
 * SAVE A LIST OR A FOLDER AS A TEMPLATE FROM THE SIDEBAR, as ClickUp does: a
 * List's or a Folder's ⋯ › Templates › Save as Template, asking "a name first,
 * and adding a description or tags is optional" (help centre, "Use List
 * templates", through search excerpts;
 * `found-30-sep/no-save-list-or-folder-as-template`). The only save was the
 * Template Center's "Save project as template", which never made a list
 * template. Tags are typed as words separated by commas; the server keeps each
 * in lower case, once (`normalizeTemplateTags`).
 */
export function SaveContainerTemplateDialog({
  workspaceId,
  target,
  onClose,
}: {
  workspaceId: string
  target: ContainerToSave | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    setName(target?.name ?? '')
    setDescription('')
    setTags('')
  }, [target])

  const save = useMutation({
    mutationFn: (what: ContainerToSave) =>
      api<{ id: string; name: string }>(`/workspaces/${workspaceId}/project-templates/save-from-project`, {
        method: 'POST',
        body: {
          projectId: what.projectId,
          ...(what.kind === 'list' ? { listId: what.id, targetType: 'list' } : { targetType: 'folder' }),
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        },
      }),
    onSuccess: (saved) => {
      toast.success(t('sidebarTemplate.saved', { name: saved?.name ?? name.trim() }))
      // The Template Center reads its cards and facets under this key (`workspace-templates-page.tsx`).
      qc.invalidateQueries({ queryKey: ['project-templates'] })
      onClose()
    },
    // The server's words: a tag past its bound, a list nobody may open here.
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('sidebarTemplate.saveFailed')),
  })

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="sidebar-save-template">
        <DialogHeader>
          <DialogTitle>
            {target?.kind === 'list' ? t('sidebarTemplate.titleList') : t('sidebarTemplate.titleFolder')}
          </DialogTitle>
          <DialogDescription>
            {target?.kind === 'list' ? t('sidebarTemplate.describeList') : t('sidebarTemplate.describeFolder')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t('sidebarTemplate.name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              data-testid="sidebar-save-template-name"
            />
          </div>
          <div>
            <Label>{t('sidebarTemplate.description')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              data-testid="sidebar-save-template-description"
            />
          </div>
          <div>
            <Label>{t('sidebarTemplate.tags')}</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('sidebarTemplate.tagsPlaceholder')}
              data-testid="sidebar-save-template-tags"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => target && save.mutate(target)}
              disabled={!target || !name.trim() || save.isPending}
              data-testid="sidebar-save-template-confirm"
            >
              {save.isPending ? t('common.saving') : t('sidebarTemplate.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
