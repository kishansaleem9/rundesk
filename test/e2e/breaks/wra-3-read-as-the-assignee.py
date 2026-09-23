# THE READ IS FILTERED AS THE ASSIGNEE, NOT THE CALLER: the plausible slip, and it shows the admin's everything to anyone.
# Reddens: workspace-read-access: "a member reading the admin’s tasks gets none from a space they are refused, nor a private task — while the rest are listed"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    const isManager = await resolveIsManager(this.db, workspaceId, actor.id, actor.role)\n    return this.db'
b = '    actor = { id: userId }\n    const isManager = await resolveIsManager(this.db, workspaceId, actor.id, actor.role)\n    return this.db'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-3-read-as-the-assignee: applied")
