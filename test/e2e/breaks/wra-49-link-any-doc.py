# LINKING ANY DOC OF THE WORKSPACE, as it was: a way to read a title back off the task.
# Re-aimed 8 October: the refusal is the doc door's words now (`found-6-oct/doc-refusals-answer-not-found`).
# Reddens: workspace-read-access: "a task’s linked docs name none the member may not open, and linking one is refused (403 “This space or project is private”, no link) — the admin’s name it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (!(await canReadDoc(this.db, doc, userId, await resolveIsManager(this.db, ctx.workspaceId, userId)))) {\n"
b = "    if (false && !(await canReadDoc(this.db, doc, userId, await resolveIsManager(this.db, ctx.workspaceId, userId)))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-49-link-any-doc: applied")
