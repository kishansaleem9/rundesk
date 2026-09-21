# The refusal for merging a SUBTASK INTO ITS PARENT removed.
#
# RENAMED AND RE-AIMED 21 September. This patch deleted the line then called
# `target-is-descendant`, on the belief — shared by the line's own comment, its
# message, and its unit test — that it refused merging a task into its own
# subtask. It ran GREEN, and that is how the real state of things was found.
#
# `targetChildIds` is the TARGET's children, so the condition fires when the
# SOURCE is one of them: it catches a subtask merged into its parent, the
# opposite relationship. Probed against a live API:
#
#     subtask → parent   400  "A task cannot be merged into its own subtask"
#     parent  → subtask  400  "…Subtasks only nest one level deep."
#
# The case everybody believed this rule handled is caught by `would-nest-twice`
# and always will be. The case it really handles had no check, and told the
# person a sentence about the merge they had not attempted.
#
# Reddens: task-merge:
#   "and a subtask merged into its parent is refused in those words"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-merge.ts'
a = "  if (targetChildIds.has(source.id)) return 'source-is-descendant'\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-merge.ts: a subtask can be merged into its own parent.')
