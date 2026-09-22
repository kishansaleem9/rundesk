# Check 13 — the "AND IT FILLS" half of the auto-fit assertion.
# Shrink the chart to a stub instead of fitting it. `span <= viewport` is
# satisfied; a Gantt 120px wide is not what Auto fit means.
#
# Reddens: gantt-controls: "it fits, and it fills"
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    setFitDayPx(width / days)"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    setFitDayPx(1)"))
print('BROKE 13: Auto fit squashes the chart to 1px/day — it "fits" the viewport by vanishing into it')
