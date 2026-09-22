# THE FIX THAT FORGETS THE OTHER DIRECTION.
#
# Dropping the `tasks.length > 0` half makes every empty list the "a filter did
# this" one — including a list that genuinely has nothing in it, which is then
# told to clear filters it does not have.
#
# Reddens list-empty-states: "the empty-list state renders on a list with no
# rows", "the filtered state is not the one on screen", "it offers to create
# the first task", and both checks in the final section.
#
# IT NAMED A CHECK THAT PASSES.
# It named "and says exactly what it said the first time", which passes. What
# falls is the whole empty-state section from its first check onwards: with the
# state latched there is no empty-list state at all on a list that never had a
# row, and the checks after it read an empty string and a filter claim that is
# not true.
#
# Reddens: list-empty-states: "the empty-list state renders on a list with no rows"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "  const emptiedByFilter = tasks.length > 0 && visibleTasks.length === 0"
b = "  const emptiedByFilter = visibleTasks.length === 0"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('$listId.tsx: an empty list now claims a filter emptied it, and offers to clear filters that are not on.')
