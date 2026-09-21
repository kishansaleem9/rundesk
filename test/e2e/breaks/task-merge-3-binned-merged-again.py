# A task already merged away can be merged again. Its work has already moved,
# so the second merge carries nothing and still deletes a row — and the trail
# that says where the work went is overwritten with a second destination that
# never received any.
#
# Reddens: task-merge: "a binned task cannot be merged again"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-merge.ts'
a = "  if (source.isArchived) return 'already-binned'\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-merge.ts: an already-binned task can be merged a second time.')
