# THE LIST NAMES EVERY LINKED DOC, the private space's too: read access without the doc rule.
# Reddens: linked-docs-access: "a member who may open a task lists its linked docs — the open space’s, not the private space’s — and the admin both"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      .where(and(eq(taskDocLinks.taskId, taskId), hidden.length ? notInArray(docs.id, hidden) : undefined))\n'
b = '      .where(and(eq(taskDocLinks.taskId, taskId), hidden.length ? undefined : undefined))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lda-2-listing-names-every-doc: applied")
