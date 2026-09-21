# The self-merge refusal removed. A task merged into itself moves its own
# comments and attachments onto itself and then deletes itself — the work and
# the survivor are the same row, so the delete takes both.
#
# Reddens: task-merge: "a task cannot be merged into itself"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-merge.ts'
a = "  if (source.id === target.id) return 'same-task'\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-merge.ts: a task can be merged into itself.')
