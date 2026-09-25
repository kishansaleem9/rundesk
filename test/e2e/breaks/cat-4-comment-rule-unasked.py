# A TICK OF ONE'S OWN ITEM ASKS NO LEVEL: a view-only member ticks it.
# Reddens: checklist-assignee-ticks: "at View a member ticks nothing, their own item included (403, unticked)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (!(tickOfTheirOwn && (await taskCommentAllowed(this.db, taskId, actorId)))) {\n'
b = '    if (!(tickOfTheirOwn && (await taskCommentAllowed(this.db, taskId, actorId) || true))) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cat-4-comment-rule-unasked: applied')
