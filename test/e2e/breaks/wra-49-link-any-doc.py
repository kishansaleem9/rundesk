# LINKING ANY DOC OF THE WORKSPACE, as it was: a way to read a title back off the task.
# Reddens: workspace-read-access: "a task’s linked docs name none the member may not open, and linking one is refused (404, no link) — the admin’s name it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (!(await canReadDoc(this.db, doc, userId, await resolveIsManager(this.db, ctx.workspaceId, userId)))) {\n      throw new NotFoundException('Doc not found')\n    }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-49-link-any-doc: applied")
