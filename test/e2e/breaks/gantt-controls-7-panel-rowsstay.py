# Check 7 — A PANEL THAT IS "COLLAPSED" AND STILL DRAWING.
# Width goes to zero, the rows keep rendering inside the clipped box. They still
# report a 260px bounding box, which is why the check counts them instead of
# asking whether they look visible.
#
# Reddens: gantt-controls: "collapsed, the panel is zero wide and draws no rows at all"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = "            {!panelCollapsed && visibleGroups.map((group) => ("
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "            {visibleGroups.map((group) => ("))
print('BROKE 7: the collapsed panel keeps rendering its task rows behind a zero-width clip')
