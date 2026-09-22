# THE ADD CONTROL THAT LANDS SOMEWHERE ELSE.
#
# The composer is inside the group, opens under the group, is labelled for the
# group — and creates into the list's LAST status. The row appears (somewhere),
# the request succeeds, and nothing on screen says the task went to a group
# other than the one you pressed. Only reading the created task back from the
# server and comparing its status with the group's key can tell.
#
# Reddens list-view-controls: "and it lands in that group (…), not in the
# list's default status".
#
# Reddens: list-view-controls: "not in the list's default status"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "                  onAdd={(title, opts) => onAddTask(status, title, opts)}"
b = "                  onAdd={(title, opts) => onAddTask((ordered[ordered.length - 1]?.key ?? status) as TaskStatus, title, opts)}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("$listId.tsx: a group's + Add Task now creates into the list's last status, whichever group it sits in.")
