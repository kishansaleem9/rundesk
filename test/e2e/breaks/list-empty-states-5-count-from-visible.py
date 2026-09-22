# THE CONFIDENT ZERO, ONE LEVEL IN.
#
# The box is right, the wording is right, and the number is read off the
# FILTERED set — so it reports 0 hidden rows over a list that is hiding three.
# Indistinguishable from a true zero, which is the whole problem.
#
# Reddens list-empty-states: "it reports the three rows the filter is hiding"
# and "and says so in words, not only in an attribute".
#
# Reddens: list-empty-states: "it reports the three rows the filter is hiding"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
pairs = [
    ("            data-hidden-count={tasks.length}", "            data-hidden-count={visibleTasks.length}"),
    ("{tCount('list.empty.filteredHidden', tasks.length, { count: tasks.length })}",
     "{tCount('list.empty.filteredHidden', visibleTasks.length, { count: visibleTasks.length })}"),
]
s = io.open(p, encoding='utf-8').read()
for a, _ in pairs:
    assert s.count(a) == 1, f'anchor {a!r} appears {s.count(a)} times, expected exactly 1'
for a, b in pairs:
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('$listId.tsx: the hidden-row count is now read off the filtered set, so it says 0 over a list hiding three.')
