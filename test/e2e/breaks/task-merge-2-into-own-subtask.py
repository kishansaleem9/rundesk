# Merging into your own subtask stops being refused. The survivor becomes a
# child of the task being binned and the parent chain points into the bin — a
# tree with an edge into deleted rows, which every reader has to be defensive
# about forever after.
#
# Reddens: task-merge: "and not into its own subtask"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-merge.ts'
a = "  if (targetChildIds.has(source.id)) return 'target-is-descendant'\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-merge.ts: a task can be merged into its own subtask.')
