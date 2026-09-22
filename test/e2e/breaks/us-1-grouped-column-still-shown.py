# Grouping by status keeps the Status column in every row.
#
# The rows really are grouped — the buckets are right, the headings are right,
# the counts are right — and each row still carries the column whose value the
# bucket it is sitting in already tells you. `groupBy === 'status' ? 'hidden' :
# 'flex'` is a ternary on a layout class, and the kind of thing a refactor
# normalises to a single class list without noticing the condition was load-
# bearing.
#
# It is a width problem rather than a correctness one, which is exactly why it
# survives a screenshot: the grid still works, and the column is only
# redundant. On a list grouped by status every row spends 7rem repeating its
# own heading, and the columns that are not redundant lose that space.
#
# The two sibling ternaries — priority and assignee — are left alone on
# purpose. The suite loops over all three, so this reddens exactly one of the
# three grouped-column checks, and the two that pass are what tell a reader
# this is one condition rather than the feature.
#
# One check, and its message carries the whole column list so the next person
# does not have to reproduce it. `and Title is still there` passes on every
# iteration.
#
# The sentence is a template literal — `grouped ${label}: the ${hidden} column
# is dropped — columns are ${cols}` — so the claim quotes the part that is
# really in the file and names the iteration outside the quotes.
#
# Reddens: ui-sweep, the `status` iteration of
#   "column is dropped — columns are"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """      <div className={cn('items-center gap-1 w-28 shrink-0', groupBy === 'status' ? 'hidden' : 'flex')}>
"""
b = """      <div className="flex items-center gap-1 w-28 shrink-0">
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the Status column stays when the rows are grouped by status.')
