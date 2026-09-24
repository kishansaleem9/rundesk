# LISTING A TASK'S LINKED DOCS ASKS THE WRITE RULE AGAIN: a member who may open the task is refused.
# Reddens: linked-docs-access: "a member who may open a task lists its linked docs — the open space’s, not the private space’s — and the admin both"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    const ctx = await this.assertTaskReadAccess(taskId, userId)\n    // Each link names its doc, so it lists only docs the reader may open\n'
b = '    const ctx = await this.assertTaskWriteAccess(taskId, userId)\n    // Each link names its doc, so it lists only docs the reader may open\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lda-1-listing-asks-to-write: applied")
