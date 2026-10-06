# A MERGE ASKS NOTHING OF THE TWO TASKS' WORKSPACES, as `mxw-1`, for the unit test of `mergeRefusal` (`found-6-oct/merge-moves-work-across-workspaces`).
# Reddens: unit: task-merge.test.ts "a task of another workspace is refused with its reason, not as one that is not there, before any other rule of the target"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-merge.ts'
a = "  if (source.workspaceId !== target.workspaceId) return 'other-workspace'\n"
b = "  // BROKEN: the two tasks' workspaces are not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mxw-2-a-merge-asks-no-workspace-unit: the merge rule asks nothing of the workspaces")
