# Check 13 — the "AND IT FILLS" half of the auto-fit assertion.
# Shrink the chart to a stub instead of fitting it. `span <= viewport` is
# satisfied; a Gantt 120px wide is not what Auto fit means.
#
# Reddens: gantt-controls: "it fits, and it fills"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    setFitDayPx(width / days)"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    setFitDayPx(1)"))
print('BROKE 13: Auto fit squashes the chart to 1px/day — it "fits" the viewport by vanishing into it')
