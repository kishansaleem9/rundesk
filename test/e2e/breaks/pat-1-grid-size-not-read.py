# The picker keeps working and the grid stops listening: the hour height goes back
# to the old constant. The mirror defect with a preview drawn on it — the setting
# saves, reads back, and changes no pixel.
# Reddens: planner-appearance-toggles: "choosing Large makes an hour taller on the real grid"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '  const hourPx = GRID_SIZES[gridSize]\n'
b = '  const hourPx = 48\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the grid ignores Grid size.')
