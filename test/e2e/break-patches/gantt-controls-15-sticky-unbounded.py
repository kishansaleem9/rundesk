# Checks 26/27 — THE BUG THIS FIX EXISTS FOR, PUT BACK.
# An unbounded pane is a scrollport with nothing to scroll, so `sticky top-0`
# on the date header resolves against a box that never moves and the header is
# sticky in name only. Nothing looks wrong until the chart has more rows than
# fit on screen.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = """                style={{ maxHeight: PANE_MAX_H }}
                onScroll={() => syncPaneScroll('chart')}
                className="flex-1 min-w-0 overflow-auto\""""
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(
    a,
    """                className="flex-1 min-w-0 overflow-x-auto\"""",
))
print('BROKE 26/27: the chart pane is unbounded again, so its sticky header has no scrollport that moves')
