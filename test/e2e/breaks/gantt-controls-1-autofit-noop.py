# Check 13/14/15 — AUTO FIT THAT LIGHTS UP AND MOVES NOTHING.
# The commonest shape of this facade: the button flips its own state, the chart
# is redrawn at the px/day it already had, and every "the control responded"
# assertion passes. Only the measured span can tell the difference.
#
# Reddens: gantt-controls: "and the last task, which was off screen, is now inside the viewport"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    setFitDayPx(width / days)"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    setFitDayPx(dayPx)"))
print('BROKE 13/14/15: Auto fit now sets the px/day the chart already had — data-fit flips, the span does not move')
