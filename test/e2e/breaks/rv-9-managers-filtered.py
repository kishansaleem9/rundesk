# MANAGERS FILTERED LIKE MEMBERS: a manager loses sight of work they oversee.
# Reddens: read-visibility: "while a manager sees all five"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
a = '    const isManager = await resolveIsManager(this.db, workspaceId, opts.actorId, opts.globalRole)\n'
b = '    const isManager = false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rv-9-managers-filtered: applied")
