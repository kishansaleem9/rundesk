# Merging into your own subtask stops being refused AS A DESCENDANT. The
# survivor would become a child of the task being binned and the parent chain
# would point into the bin — a tree with an edge into archived rows, which
# every reader has to be defensive about forever after.
#
# IT RAN GREEN THE FIRST TIME, and that is the finding. `target-is-descendant`
# is not the only rule that refuses this input: the source has a subtask and
# the target IS that subtask, so `would-nest-twice` catches it too. The check
# asserted a 4xx and nothing more, so deleting either rule left it passing —
# two mechanisms that produce one status code have to be told apart by their
# message, which is a lesson this repository already had in
# `sidebar-reorder-9` and had not applied here.
#
# So the suite gained a check that reads the sentence, and this patch reddens
# THAT one. The plain "not into its own subtask" check stays green under it,
# correctly: the merge really is still refused, by the other rule. Defence in
# depth is worth keeping; a check that cannot see which guard fired is not.
#
# Reddens: task-merge:
#   "and refuses it as a descendant, not by the nesting-depth rule that also catches it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-merge.ts'
a = "  if (targetChildIds.has(source.id)) return 'target-is-descendant'\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-merge.ts: the descendant rule is gone; the nesting rule still covers for it.')
