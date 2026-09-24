# THE TABLE'S PANE HAS NO HEIGHT AGAIN: the header's scrollport never scrolls,
# and the header goes with the page.
# Reddens: sticky-headers: "the list table’s header stays at the top of its pane while thirty rows scroll under it"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '      <div ref={tableParentRef} className="max-h-[70vh] overflow-auto">\n'
b = '      <div ref={tableParentRef} className="overflow-x-auto">\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sth-1-table-pane-unbounded: the table pane is unbounded')
