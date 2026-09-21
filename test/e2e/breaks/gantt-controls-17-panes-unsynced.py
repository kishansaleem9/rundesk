# Check 26 — THE TWO PANES COMING APART.
# Each pane is its own scrollport, which is what lets both headers stick; the
# cost is that nothing keeps the task names level with their bars except this
# one assignment. Drop it and the chart scrolls while the names stay put — every
# row is then labelled with somebody else's task, which reads as a data bug.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    target.scrollTop = source.scrollTop"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    void target"))
print('BROKE 26: the task panel no longer follows the chart, so names and bars drift apart')
