# The teams work preview stops filtering out closed work.
#
# The independent reader, made blind. Everything about the task is correct —
# the status is stored, the category says closed, both checks above pass — and
# a person's "current work" card goes on listing work they finished, forever.
#
# `ne(tasks.statusCategory, 'closed')` sits beside `eq(tasks.isArchived,
# false)` in the same `and(…)`, which is the shape a line gets deleted from: a
# list of filters where each looks like a variation on the last.
#
# WHY THE SUITE CARRIES THIS READER AT ALL. Reading `statusCategory` back from
# `/tasks/:id` is a second look at the same column — it proves the write, not
# the consequence. The whole argument of this item is that other surfaces
# reason on the category, so one of them has to be asked. This patch is what
# happens when that surface stops asking.
#
# REDDENS ONE. The control above it — that the preview DOES list the task while
# it is open — stays green under this patch, because a filter that has stopped
# filtering still returns the open task. The pair is what makes each half mean
# something: this one reddens the absence, and a patch that broke the preview
# outright would redden both and prove neither.
#
# Reddens: list-statuses-seeded: "and a reader that reasons on the category no longer counts it as current work"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
a = """          eq(tasks.isArchived, false),
          ne(tasks.statusCategory, 'closed'),
"""
b = """          eq(tasks.isArchived, false),
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-groups.service.ts: the work preview now lists finished work as current.')
