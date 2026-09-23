# A READ-SIDE FILTER AIMED AT THE WRONG WORKSPACE: safe, and every parent,
# subtask, dependency and label disappears. Only the positive halves see it.
# Reddens: task-boundaries: "and so are its dependencies — the related task is handed back whole, so a foreign one was a read of it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    const homeWorkspaceId = home.workspaceId\n'
b = "    const homeWorkspaceId = '00000000-0000-0000-0000-000000000000'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-44-read-side-hides-everything: applied")
