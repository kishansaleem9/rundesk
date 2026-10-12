# Check 10 — COLLAPSING A GROUP IN ONE PANE ONLY.
# The names disappear from the task panel and the bars stay in the chart: the
# two panes read from different sources. This is the shape the check exists for,
# which is why it is asserted on the BARS and not on the names.
#
# Reddens: gantt-controls: "collapsing the group takes its bars out of the chart, not just its names out of the panel"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = "              {visibleGroups.map((group) => (\n                <div key={group.key}>"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(
    a,
    "              {shownGroups.map((group) => (\n                <div key={group.key}>",
))
print('BROKE 10: the chart pane ignores collapsed groups and keeps drawing their bars')
