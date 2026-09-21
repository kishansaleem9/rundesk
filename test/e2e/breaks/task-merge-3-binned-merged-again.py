# The merge rule for an already-binned source removed. Its work has already
# moved, so a second merge carries nothing and still archives a row — and the
# trail saying where the work went is overwritten with a destination that never
# received any.
#
# IT RAN GREEN THE FIRST TIME, for the same reason as `task-merge-2`. A merged
# source is `isArchived`, and `assertTaskWriteAccess` refuses archived tasks on
# its own a few lines further down — so `already-binned` can be deleted
# outright and the plain "a binned task cannot be merged again" check stays
# green, because the merge really is still refused.
#
# The suite gained a check that reads the sentence, and this patch reddens THAT
# one. Two guards for one condition is defence in depth and worth keeping; a
# check that cannot tell them apart means either may rot unnoticed, and the one
# that rots will be the one nobody is looking at.
#
# Reddens: task-merge:
#   "and says so as a merge refusal, not as a write-access failure"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-merge.ts'
a = "  if (source.isArchived) return 'already-binned'\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-merge.ts: the merge rule for a binned source is gone; write-access stands in for it.')
