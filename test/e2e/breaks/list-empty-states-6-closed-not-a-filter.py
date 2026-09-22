# ONE AXIS DROPPED FROM THE LIST OF NARROWINGS.
#
# "Show closed tasks" empties the list without anything being typed, and it is
# the case the old copy was most wrong about — the rows exist, they are
# finished, and the screen said the list had never had anything in it. Dropped
# here, the filtered state never appears for it and the empty-list box comes
# back, on a list full of completed work.
#
# Reddens list-empty-states: the three checks in the Closed-toggle section.
#
# Reddens: list-empty-states: "and names the Closed toggle as the reason"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "    if (!showClosed) {\n      out.push({ key: 'closed', label: t('list.empty.filterClosed'), clear: () => setShowClosed(true) })\n    }"
b = "    // (closed is no longer treated as a narrowing)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('$listId.tsx: hiding closed tasks is no longer counted as a filter, so a list of finished work reads as empty.')
