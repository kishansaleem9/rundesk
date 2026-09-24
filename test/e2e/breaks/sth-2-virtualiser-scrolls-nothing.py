# THE VIRTUALISER WATCHES NO SCROLLER: past the first screen, no row is drawn.
# Reddens: sticky-headers: "with 150 rows, drawn as they scroll into view, the header stays at the top of the pane and the pane reaches the last row"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '    getScrollElement: () => tableParentRef.current,\n'
b = '    getScrollElement: () => null,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sth-2-virtualiser-scrolls-nothing: the virtualiser has no scroll element')
