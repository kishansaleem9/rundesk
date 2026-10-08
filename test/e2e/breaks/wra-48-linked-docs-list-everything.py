# A TASK'S LINKED DOCS WITH NO READER RULE, as they were: each doc's title, whoever reads the task.
# Reddens: workspace-read-access: "a task’s linked docs name none the member may not open, and linking one is refused (403 “This space or project is private”, no link) — the admin’s name it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      .where(and(eq(taskDocLinks.taskId, taskId), hidden.length ? notInArray(docs.id, hidden) : undefined))\n'
b = '      .where(eq(taskDocLinks.taskId, taskId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-48-linked-docs-list-everything: applied")
