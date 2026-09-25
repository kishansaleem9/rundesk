# THE WRITABLE SPACES ARE EVERY SPACE THE PERSON CAN SEE: a view-only one among them.
# Reddens: view-only-space-menus: "a view-only space’s own menu offers a member nothing that goes in it (a task, a form, a list, a folder, a project) — the open space’s offers them, and the view-only space’s offers them to the admin"
#   or "the Task, List, Folder and Form creators offer the member the open space and not the view-only one"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const writable = await this.narrowToWritable(workspaceId, seen, actorId)\n    return writable.map((s) => ({ id: s.id }))\n'
b = '    const writable = seen\n    return writable.map((s) => ({ id: s.id }))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("vsm-2-every-space-writable: every space writable")
