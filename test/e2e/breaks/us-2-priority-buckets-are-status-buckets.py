# Grouping by priority falls through to the status grouping.
#
# THE DUPLICATED LIST, arriving as deduplication. Both branches build buckets
# from the same task array and render the same Card, and the priority one is the
# shorter of the two — so an early return that sends `'priority'` to the status
# code reads as removing a redundant renderer. The select still offers Priority,
# still shows Priority as chosen, and the rows really are grouped.
#
# They are grouped by the wrong thing, and every bucket is individually
# plausible: "Backlog (3)", "In progress (2)" are real headings with real
# counts. Nothing about one screen says it is the wrong grouping. It takes
# regrouping and comparing to see it.
#
# ONE CHECK, AND IT IS THE ONE THE SUITE WROTE FOR EXACTLY THIS: "regrouping
# genuinely rebuckets the rows", which compares the status headings against the
# priority headings and fails when they are identical. `status buckets become
# priority buckets` passes — both groupings produce buckets — and so does
# `grouping by assignee produces people buckets`, because assignee is
# untouched. A suite that only asked whether each grouping rendered would call
# this working.
#
# Reddens: ui-sweep: "regrouping genuinely rebuckets the rows"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """  if (groupBy === 'priority') {
    const priorityGroups: TaskPriority[] = ['urgent', 'high', 'normal', 'low']
"""
b = """  if (false as boolean) {
    const priorityGroups: TaskPriority[] = ['urgent', 'high', 'normal', 'low']
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: priority grouping falls through to the status grouping.')
