# A ROW ITS READER MAY NOT RESTORE SAYS NOTHING: no Restore and no "view only", so the tab reads as broken.
# Reddens: archived-tasks-access: "Settings offers the manager its Archived tab too, listing all three archived tasks and offering Restore on none of them, since the manager restores only in spaces they belong to"
#   or "on the member’s Archived tab the view-only space’s task is listed without Restore and marked view only, and no Archived workspaces card is offered to restore from"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              ) : (\n                <span\n                  className="shrink-0 text-xs text-muted-foreground"\n                  title={t(\'settings.archivedViewOnlyHint\')}\n                  data-testid="archived-task-view-only"\n                >\n                  {t(\'share.levelView\')}\n                </span>\n              )}\n'
b = '              ) : null}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ata-8-view-only-says-nothing: non-restorable rows are blank')
