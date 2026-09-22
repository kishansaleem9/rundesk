# THE WHOLE BUG, back.
#
# `emptiedByFilter` is what splits "this list has nothing in it" from "your
# filter matched nothing". Forced false, the filtered branch never renders and
# every filtered list falls through to "No tasks yet / press C to add the
# first" with a Create task button — which is exactly what shipped.
#
# Reddens list-empty-states: every check from "a search that matches nothing
# produces the FILTERED empty state" onward, including the one with teeth
# ("the filtered state says something DIFFERENT from the empty-list state").
#
# Reddens: list-empty-states: "a search that matches nothing produces the FILTERED empty state"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "  const emptiedByFilter = tasks.length > 0 && visibleTasks.length === 0"
b = "  const emptiedByFilter = false"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('$listId.tsx: emptiedByFilter is always false — a filtered list reports itself as an empty one again.')
