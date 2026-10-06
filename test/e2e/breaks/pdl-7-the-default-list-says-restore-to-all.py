# A DELETED DEFAULT LIST TELLS EVERYBODY TO RESTORE IT, as it did: a member whose list an admin deleted is sent to a
# Trash that will not let them restore it.
# Reddens: planner-default-list: "and a member whose chosen list an admin deleted is told to ask a workspace admin, or whoever deleted it, to restore it — the Trash will not let them — or to choose another; no task made"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '              err.mayRestore\n'
b = '              true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-7-the-default-list-says-restore-to-all: everybody is told to restore their deleted Default list')
