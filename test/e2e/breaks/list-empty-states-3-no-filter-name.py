# NAMES NOTHING.
#
# The frame's empty state says WHICH filter emptied the list ("turn off Me
# Mode"). This keeps the box, the count and the Clear button and drops the one
# sentence that says what is being filtered on — which is the difference
# between an explanation and a shrug.
#
# Reddens list-empty-states: "the search term itself is on screen".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "{t('list.empty.filteredBy', { filters: activeNarrowings.map((n) => n.label).join(' · ') })}"
b = "{t('list.empty.filteredBy', { filters: '' })}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('$listId.tsx: the filtered empty state no longer names any of the filters it is complaining about.')
