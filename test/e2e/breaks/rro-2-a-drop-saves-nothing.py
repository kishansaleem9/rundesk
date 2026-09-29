# A DROP ON THE SIDEBAR PAGE SAVES NOTHING: the row is picked up, carried and let go, and the order stays as it was.
# Reddens: rail-reorder: "dragging Backlog above Priorities stores the new order, Backlog first and the rest as they were"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = '    if (!over || active.id === over.id) return\n'
b = '    if (over || active.id === over?.id) return\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rro-2-a-drop-saves-nothing: onDragEnd returns before it moves anything')
