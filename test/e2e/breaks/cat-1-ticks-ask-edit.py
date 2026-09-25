# EVERY TICK ASKS EDIT, as it did: a commenter ticks nothing, their own item included.
# Reddens: checklist-assignee-ticks: "at Comment a member ticks the checklist item assigned to them — and nothing else: not the admin’s item, and not their own item’s words (403 each, unchanged)"
#   or "the sheet offers a commenter the tick on their own item, and it saves — and leaves the admin’s item, deleting and renaming as they were, not pressed"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      Object.keys(patch).length === 1 && typeof patch.isDone === 'boolean' && existing.assigneeId === actorId\n"
b = "      Object.keys(patch).length === 1 && typeof patch.isDone === 'boolean' && existing.assigneeId === actorId && false\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cat-1-ticks-ask-edit: applied')
