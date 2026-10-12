# A DEPENDENCY IS DRAWN FROM THE START OF THE BAR WAITED ON.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart:
#   "a line is drawn from each task to the one waiting on it, from the end of the one bar to the start of the other"
#   "a bar dragged two days moves both its dates two days, still date-only (read by SQL), and is drawn there when the page is opened again"
#   "a press on a bar that does not move it opens the task"
#
# The line leaves the blocker where it begins, not where it ends.
# Drawn back across its own bar, the line's wide stroke — the one a double-click is aimed at — lies over
# D and A, and takes the drag on D and the press on A.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('const d = `M ${from.x1} ${from.y} L ${mid} ${from.y}',
     'const d = `M ${from.x0} ${from.y} L ${mid} ${from.y}'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-5-lines-from-the-start: A DEPENDENCY IS DRAWN FROM THE START OF THE BAR WAITED ON.')
