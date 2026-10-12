# Check 3 — THE WEEK BAND AS A FACADE.
# Every cell prints W1. The band renders, the header grows, the toggle toggles;
# the only assertion that can catch it is one that knows what week it is.
#
# IT NAMED A CHECK THAT PASSES.
# It named "the band is off to begin with, so turning it on is a change and not a
# redraw", which passes — the band really does start off. What falls is the
# label: the week containing the fixture’s first Monday renders W1 where the
# calendar says W10, which is a number in the right place saying the wrong
# thing.
#
# The check’s sentence is a template literal, so the claim quotes its tail —
# the part that is really in the file — and the interpolated week number stays
# outside the quotes.
#
# Re-aimed 8 October: the header draws the days in view (`found-6-oct/timeline-and-gantt-draw-a-column-per-day`).
# Reddens: gantt-controls: "which is the ISO week it is"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = "        week: isoWeekNumber(monday),"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "        week: 1,"))
print('BROKE 3: every week in the band is labelled W1')
