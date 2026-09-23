# THE SETTINGS FORM WITH ITS OWN TEN EVENTS AGAIN, four short of the server's catalog.
# Reddens: webhook-access: "the form offers every event the server lists, each by its name"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '              {(eventCatalog.data ?? []).map((ev) => (\n'
b = "              {(eventCatalog.data ? ['task.created', 'task.updated', 'task.deleted', 'task.status_changed', 'task.assigned', 'comment.created', 'project.created', 'member.invited', 'member.removed', 'form.submitted'] : []).map((ev) => (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-12-settings-own-event-list: applied")
