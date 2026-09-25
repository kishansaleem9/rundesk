# A COMMENTER TICKS ANYBODY'S ITEM, not only theirs.
# Reddens: checklist-assignee-ticks: "at Comment a member ticks the checklist item assigned to them — and nothing else: not the admin’s item, and not their own item’s words (403 each, unchanged)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      Object.keys(patch).length === 1 && typeof patch.isDone === 'boolean' && existing.assigneeId === actorId\n"
b = "      Object.keys(patch).length === 1 && typeof patch.isDone === 'boolean' && existing.assigneeId !== undefined\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cat-2-anyones-item: applied')
