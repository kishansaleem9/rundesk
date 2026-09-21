# Check 7 — A PANEL THAT IS "COLLAPSED" AND STILL DRAWING.
# Width goes to zero, the rows keep rendering inside the clipped box. They still
# report a 260px bounding box, which is why the check counts them instead of
# asking whether they look visible.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "                {!panelCollapsed && visibleGroups.map((group) => ("
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "                {visibleGroups.map((group) => ("))
print('BROKE 7: the collapsed panel keeps rendering its task rows behind a zero-width clip')
