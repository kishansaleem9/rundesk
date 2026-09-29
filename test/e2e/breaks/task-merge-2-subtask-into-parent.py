# A SUBTASK MERGED INTO ITS OWN PARENT IS REFUSED AGAIN.
#
# RE-AIMED 29 September (`commit-log/log-b7ee313-1`). This patch used to delete
# the refusal, back when merging a subtask into its parent was refused on a
# reason that described the opposite merge. The merge is allowed now, as in
# ClickUp, so the patch puts a refusal back (under the name the rules already
# use for a merge into itself, which is what a careless rule would reach for).
#
# Reddens: task-merge:
#   "and a subtask merged into its own parent is merged, as in ClickUp: its comment lands on the parent and the subtask goes to the bin"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-merge.ts'
a = "  if (sourceHasSubtasks && target.parentTaskId) return 'would-nest-twice'\n"
b = "  if (source.parentTaskId === target.id) return 'same-task'\n  if (sourceHasSubtasks && target.parentTaskId) return 'would-nest-twice'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-merge.ts: a subtask can no longer be merged into its own parent.')
