# The timeline endpoint accepts `projectId` and narrows on nothing — the shape
# the parameter decays into when nothing exercises it, which until this check
# nothing did.
#
# REWRITTEN 21 September: the first version used `false && opts.projectId`,
# which is the `{false && …}` narrowing trap already in the process doc — it
# runs, prints its confirmation, and does not compile, so `wt-break.sh`
# reported BUILD FAILED. This compares the column to itself instead: a
# condition that is always true for every row, which is exactly "narrows on
# nothing", and which type-checks.
#
# Reddens: gantt-controls:
#   "the timeline endpoint really narrows on `projectId`, which no client sends"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """          ...(opts.projectId ? [eq(lists.projectId, opts.projectId)] : []),"""
b = """          ...(opts.projectId ? [eq(lists.projectId, lists.projectId)] : []),"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: the timeline filters on a tautology, i.e. on nothing.')
