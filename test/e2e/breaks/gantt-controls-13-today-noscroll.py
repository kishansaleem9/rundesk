# Checks 24/25 — TODAY THAT SETS STATE AND MOVES NOTHING.
# The range still grows to reach today, the line still appears, `data-anchor-today`
# still flips to "true" — and the viewport never moves, so the line the button
# promised to show you is off to the right where it always was. This is the
# patch the coordinator asked for: state without scroll.
#
# THE CLAIM WAS AIMED AT THE WRONG CHECK.
# It named "and it reached today by growing the range", which passes: the range
# really does grow. What falls is the SECOND press, after the chart has been
# scrolled away — which is the whole point of a Today button and the half a
# range-growing check cannot see.
#
# Reddens: gantt-controls: "and a second press scrolls back to today after the chart was scrolled away"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    el.scrollLeft = Math.max(0, Math.min(todayOffsetPx - el.clientWidth / 2, maxScroll))"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    void maxScroll"))
print('BROKE 24/25: Today grows the range and flips its state, but never scrolls the viewport')
