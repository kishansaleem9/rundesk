# Check 8 — THE NEIGHBOUR CHECK, which is the whole point of this one.
# The panel still collapses to zero and still stops drawing its rows; the grid
# beside it simply no longer grows into the space. Every "did the panel
# collapse" assertion passes; the measured width of the chart does not.
#
# Pins the width WITHOUT touching the bounded scrollport, so the sticky checks
# stay green and only check 8 reddens.
#
# Reddens: gantt-controls: "and the grid took the width back"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = """            style={{ maxHeight: PANE_MAX_H }}
            onScroll={() => syncPaneScroll('chart')}
            className="flex-1 min-w-0 overflow-auto\""""
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(
    a,
    """            style={{ maxHeight: PANE_MAX_H, width: 900 }}
            onScroll={() => syncPaneScroll('chart')}
            className="shrink-0 min-w-0 overflow-auto\"""",
))
print('BROKE 8: the chart is pinned to 900px, so the width the panel gives up goes nowhere')
