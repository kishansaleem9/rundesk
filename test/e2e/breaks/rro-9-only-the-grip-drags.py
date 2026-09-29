# ONLY THE GRIP PICKS A ROW UP: the row's name, where frame 14:13 draws the open hand, carries nothing.
# Reddens: rail-reorder: "dragging Backlog above Priorities stores the new order, Backlog first and the rest as they were"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      {...listeners}\n      data-testid="planner-rail-row"\n', '      data-testid="planner-rail-row"\n'),
    ('        data-testid={`planner-rail-handle-${section}`}\n', '        {...listeners}\n        data-testid={`planner-rail-handle-${section}`}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rro-9-only-the-grip-drags: the drag listeners move from the row to the grip')
