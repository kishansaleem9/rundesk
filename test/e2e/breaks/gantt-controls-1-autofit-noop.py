# Check 13/14/15 — AUTO FIT THAT LIGHTS UP AND MOVES NOTHING.
# The commonest shape of this facade: the button flips its own state, the chart
# is redrawn at the px/day it already had, and every "the control responded"
# assertion passes. Only the measured span can tell the difference.
#
# Reddens: gantt-controls: "and the last task, which was off screen, is now inside the viewport"
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    setFitDayPx(width / days)"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    setFitDayPx(dayPx)"))
print('BROKE 13/14/15: Auto fit now sets the px/day the chart already had — data-fit flips, the span does not move')
