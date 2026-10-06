# A MERGE ASKS NOTHING OF THE TWO TASKS' WORKSPACES, as it did (`found-6-oct/merge-moves-work-across-workspaces`): a task of one workspace
# merges into a task of another, and its comment moves into the other workspace.
# Reddens: task-merge: "a task of another workspace cannot be merged into one of this: 400, saying a task can only be merged into a task of its own workspace, to a caller who may open both — and nothing moves: its comment stays on it and it is not binned (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-merge.ts'
a = "  if (source.workspaceId !== target.workspaceId) return 'other-workspace'\n"
b = "  // BROKEN: the two tasks' workspaces are not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mxw-1-a-merge-asks-no-workspace: a merge moves work across workspaces")
