# A CLEAR THAT CLEARS ONE THING.
#
# The commonest half-fix: the button is written for the axis that was being
# demoed (the search box) and silently ignores the rest. With two narrowings
# on, pressing it leaves the list just as empty and the button reads as dead.
#
# Reddens list-empty-states: "one press clears both of them", "the rows are
# back after the two-axis clear", and the whole Closed-toggle branch.
#
# Reddens: list-empty-states: "and one press clears both of them"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "    for (const n of activeNarrowings) n.clear()"
b = "    activeNarrowings.find((n) => n.key === 'search')?.clear()"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('$listId.tsx: Clear filters now resets only the search box and leaves every other narrowing on.')
